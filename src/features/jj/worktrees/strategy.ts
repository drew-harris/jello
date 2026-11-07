import { randomUUID } from "node:crypto"
import { lstat, realpath } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { Worktree } from "@opencode/plugin"
import type { WorktreeDefinition } from "@opencode/plugin/promise/worktree"
import { abortable } from "../../../shared/server/async-cache.ts"
import { runCommand } from "../../../shared/server/command.ts"
import { runJJ, validateCommitID } from "../command.ts"
import type { JJWorktreeOptions } from "./options.ts"
import { absolutePath, contains, jjRepository, missing } from "./repository.ts"

export const JJ_WORKTREE_STRATEGY = "jello.jj"
const template = `'{"name":' ++ json(name) ++ ',"root":' ++ json(root) ++ '}\n'`
interface Workspace { name: string; root: string | null }

// Shared only within this server process, across location-scoped plugin instances.
// This is not a cross-server lock and does not serialize unrelated JJ actions.
const mutations = new Map<string, Promise<void>>()
function mutate<T>(store: string, signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  signal.throwIfAborted()
  const pending = (mutations.get(store) ?? Promise.resolve()).then(() => {
    signal.throwIfAborted()
    return work()
  })
  const tail = pending.then(() => {}, () => {})
  mutations.set(store, tail)
  void tail.then(() => { if (mutations.get(store) === tail) mutations.delete(store) })
  return abortable(pending, signal)
}

export function createJJWorktreeStrategy(
  canonical: string,
  options: JJWorktreeOptions,
  beforeRemove?: (directory: string, signal: AbortSignal) => Promise<void>,
): WorktreeDefinition {
  const jj = (args: string[], cwd: string, signal: AbortSignal, write = false) => runJJ(args, {
    cwd, signal, timeout: write ? options.writeTimeoutMs : options.readTimeoutMs, maxBuffer: options.maxOutputBytes,
  }, options.command)

  async function repository(directory: string, signal: AbortSignal) {
    signal.throwIfAborted()
    const [anchor, target] = await Promise.all([jjRepository(canonical), jjRepository(directory)])
    signal.throwIfAborted()
    if (!anchor || !target || anchor.store !== target.store) throw new Error("Workspace does not belong to this JJ repository.")
    return { ...target, canonical: anchor.root }
  }

  // Capability checks are lazy and cached only after success. Setup/list never
  // snapshot a checkout or require a version subprocess for every known root.
  let supported = false
  async function capabilities(cwd: string, signal: AbortSignal) {
    if (supported) return
    const add = await jj(["workspace", "add", "--help"], cwd, signal)
    try { await jj(["workspace", "remove", "--help"], cwd, signal) } catch (error) {
      signal.throwIfAborted()
      throw new Error("Jello worktrees require JJ with workspace remove support (use JJ 0.47.1 or newer).", { cause: error })
    }
    if (!add.stdout.includes("--sparse-patterns") || (options.colocate && !add.stdout.includes("--colocate"))) {
      throw new Error("This JJ cannot create the requested workspace layout. Upgrade to JJ 0.47.1 or newer.")
    }
    supported = true
  }

  async function workspaces(cwd: string, signal: AbortSignal): Promise<Workspace[]> {
    const { stdout } = await jj(["workspace", "list", "--ignore-working-copy", "-T", template], cwd, signal)
    return stdout.split("\n").filter((line) => line.trim()).map((line) => {
      const value = JSON.parse(line) as Workspace
      if (typeof value.name !== "string" || !value.name || (value.root !== null && typeof value.root !== "string")) {
        throw new Error("JJ returned an invalid workspace record.")
      }
      if (value.root !== null) absolutePath(value.root)
      return value
    })
  }

  return {
    id: JJ_WORKTREE_STRATEGY,
    async list(sourceDirectory, { signal }) {
      const source = await repository(sourceDirectory, signal)
      const records = await workspaces(source.root, signal)
      const entries = new Map<string, { directory: string; type: "root" | "worktree" }>()
      // No checkout scans or snapshots. Sequential metadata probes keep discovery
      // bounded even with thousands of workspaces on a remote filesystem.
      for (const record of records) {
        signal.throwIfAborted()
        if (record.root === null) continue
        try {
          const path = await realpath(record.root)
          const repo = await jjRepository(path)
          if (repo?.root !== path || repo.store !== source.store) continue
          entries.set(path, { directory: path, type: repo.main || path === source.canonical ? "root" : "worktree" })
        } catch (error) { if (!missing(error)) throw error }
      }
      return [...entries.values()]
    },
    async create(input, { signal }) {
      const source = await repository(input.sourceDirectory, signal)
      return mutate(source.store, signal, async () => {
        await capabilities(source.root, signal)
        const requested = absolutePath(input.directory)
        // Resolve the parent to normalize symlink aliases without requiring the
        // not-yet-created destination to exist. The host creates its parent.
        const directory = resolve(await realpath(dirname(requested)), basename(requested))
        try {
          await lstat(directory)
          throw new Error(`Workspace destination already exists: ${directory}`)
        } catch (error) { if (!missing(error)) throw error }
        const records = await workspaces(source.root, signal)
        for (const record of records) {
          if (!record.root) continue
          let root: string
          try { root = await realpath(record.root) } catch (error) { if (missing(error)) continue; throw error }
          if (contains(root, directory) || contains(directory, root)) {
            throw new Error("Workspace destinations must not overlap existing JJ workspaces.")
          }
        }
        // A destination basename is not globally unique across the JJ store.
        const name = `jello-${basename(directory).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48)}-${randomUUID()}`
        const args = ["workspace", "add", "--name", name, options.colocate ? "--colocate" : "--no-colocate", `--sparse-patterns=${options.sparsePatterns}`]
        if (input.branch !== undefined || options.start === "current") {
          const ref = input.branch ?? "@"
          if (!ref.trim() || ref.length > 4096 || /[\0\r\n]/.test(ref)) throw new Error("Expected a single starting JJ revision.")
          // Workspace add requires working-copy updates. Let that command do the
          // single source snapshot; @ must resolve AFTER that snapshot. Other
          // refs are validated/pinned without an extra expensive snapshot.
          if (ref === "@") args.push("--revision=@")
          else {
            const { stdout } = await jj(["log", "--ignore-working-copy", "--no-graph", `--revisions=${ref}`, "--limit", "2", "-T", 'commit_id ++ "\\n"'], source.root, signal)
            const commits = stdout.trim().split("\n").filter(Boolean)
            if (commits.length !== 1) throw new Error("The starting ref must resolve to exactly one JJ revision.")
            validateCommitID(commits[0])
            args.push(`--revision=${commits[0]}`)
          }
        }
        try {
          await jj([...args, "--", directory], source.root, signal, true)
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          throw new Error(`JJ workspace creation did not complete at ${directory}: ${detail}\nInspect any partial workspace before retrying; Jello has not deleted it.`, { cause: error })
        }
        return { directory }
      })
    },
    async remove(input, { signal }) {
      const requested = absolutePath(input.directory)
      if ((await lstat(requested)).isSymbolicLink()) throw new Error("Refusing to remove a workspace through a symlink.")
      const target = await repository(requested, signal)
      if (await realpath(requested) !== target.root) throw new Error("Remove requires the exact JJ workspace root.")
      if (target.main || target.root === target.canonical) throw new Error("Cannot remove the main or canonical JJ workspace.")
      await mutate(target.store, signal, async () => {
        await capabilities(target.canonical, signal)
        const records = await workspaces(target.canonical, signal)
        let selected: Workspace | undefined
        for (const record of records) {
          if (!record.root) continue
          let root: string
          try { root = await realpath(record.root) } catch (error) { if (missing(error)) continue; throw error }
          if (root === target.root) selected = record
          else if (contains(target.root, root)) throw new Error("Move nested JJ workspaces out before removing their parent.")
        }
        if (!selected) throw new Error("This directory is not a registered JJ workspace. No files were removed.")
        await beforeRemove?.(target.root, signal)
        if (!input.force) {
          const { stdout } = await jj(["log", "--no-graph", "-r", "@", "-T", "empty"], target.root, signal, true)
          if (stdout.trim() !== "true") throw new Worktree.OperationError({ message: "This JJ workspace contains changes. Confirm force removal to snapshot them and delete the checkout.", forceRequired: true })
          const sparse = await jj(["sparse", "list", "--ignore-working-copy"], target.root, signal)
          if (sparse.stdout.trim() !== ".") {
            throw new Worktree.OperationError({ message: "This is a sparse JJ workspace. Files outside its sparse patterns may not be snapshotted; force removal deletes them permanently.", forceRequired: true })
          }
          // JJ snapshots tracked changes but deletes ignored files. Git can find
          // untracked/ignored directories without recursively listing huge build
          // trees. Without a matching Git checkout, require explicit confirmation.
          try {
            // Git's parent index doesn't report ignored content inside tracked
            // submodules. Don't infer that such a checkout is disposable.
            try { await lstat(join(target.root, ".gitmodules")); throw new Error("Submodule checkout") } catch (error) { if (!missing(error)) throw error }
            const git = { cwd: target.root, signal, timeout: options.readTimeoutMs, maxBuffer: options.maxOutputBytes }
            const top = await runCommand("git", ["rev-parse", "--show-toplevel"], git)
            if (await realpath(top.stdout.trim()) !== target.root) throw new Error("Not a colocated Git checkout")
            const untracked = await runCommand("git", ["ls-files", "--others", "--directory", "-z"], git)
            if (untracked.stdout.split("\0").some((path) => path && path !== ".jj/")) throw new Error("Untracked or ignored files")
          } catch (error) {
            signal.throwIfAborted()
            throw new Worktree.OperationError({ message: "This workspace has untracked/ignored files, or their safety could not be verified. Force removal deletes those files permanently.", forceRequired: true })
          }
        }
        // Revalidate immediately before the destructive command. Never use rm or
        // workspace forget as a fallback, and never auto-update stale checkouts.
        const current = await repository(requested, signal)
        if (current.root !== target.root || current.store !== target.store || current.main) throw new Error("Workspace identity changed during removal.")
        await jj(["workspace", "remove", "--", selected.name], target.canonical, signal, true)
      })
    },
  }
}

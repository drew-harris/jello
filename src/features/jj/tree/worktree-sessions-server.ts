import { realpath } from "node:fs/promises"
import { resolve } from "node:path"
import type { Plugin } from "@opencode/plugin"
import { runJJ, validateCommitID } from "../command.ts"
import { contains, jjRepository, missing } from "../worktrees/repository.ts"
import type { WorktreeSession } from "./worktree-sessions.ts"

const template = `'{"name":' ++ json(name) ++ ',"root":' ++ json(root) ++ ',"commitID":' ++ json(target.commit_id()) ++ '}\n'`
interface Target { name: string; root: string; commitID: string }
const MAX_SESSIONS = 2000

export async function readWorktreeSessions(ctx: Pick<Plugin.Context, "session" | "location">, directory: string, signal: AbortSignal) {
  signal.throwIfAborted()
  const [repo, canonical] = await Promise.all([jjRepository(directory), jjRepository(ctx.location.project.canonical)])
  if (!repo || !canonical || repo.store !== canonical.store) throw new Error("Worktree sessions require the repository's OpenCode request location.")
  const { stdout } = await runJJ(["workspace", "list", "--ignore-working-copy", "-T", template], {
    cwd: repo.root, signal, timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  })
  const targets: Target[] = []
  for (const line of stdout.split("\n").filter((line) => line.trim())) {
    const value = JSON.parse(line) as { name: string; root: string | null; commitID: string }
    if (value.root === null) continue
    if (typeof value.name !== "string" || typeof value.root !== "string") throw new Error("Invalid JJ workspace record.")
    validateCommitID(value.commitID)
    const root = resolve(value.root)
    if (root !== canonical.root) targets.push({ name: value.name, root, commitID: value.commitID })
  }
  // One metadata command for the shared store, not one JJ command or checkout
  // snapshot per session/workspace. Do not enumerate any checkout's contents.
  targets.sort((a, b) => b.root.length - a.root.length)
  if (!targets.length) return { worktreeSessions: [] as WorktreeSession[], worktreeSessionsTruncated: false }
  const sessions: WorktreeSession[] = []
  const seen = new Set<string>()
  const aliases = new Map<string, string>()
  let cursor: string | undefined
  let count = 0
  let pages = 0
  do {
    const page = await ctx.session.list(cursor ? { cursor, limit: 100 } : {
      project: ctx.location.project.id, parentID: null, archived: false, limit: 100, order: "desc",
    }, { signal })
    pages++
    for (const session of page.data) {
      signal.throwIfAborted()
      count++
      if (session.parentID || session.time.archived || seen.has(session.id)) continue
      seen.add(session.id)
      const path = resolve(session.location.directory)
      let target = targets.find((target) => contains(target.root, path))
      // Most paths match directly. Normalize aliases once per distinct directory
      // only when necessary, rather than making filesystem calls per session.
      if (!target) {
        let normalized = aliases.get(path)
        if (normalized === undefined) {
          try { normalized = await realpath(path) } catch (error) { if (!missing(error)) throw error; normalized = "" }
          aliases.set(path, normalized)
        }
        if (normalized) target = targets.find((target) => contains(target.root, normalized!))
      }
      if (!target) continue
      sessions.push({ sessionID: session.id, title: session.title?.trim() || "Untitled session", directory: target.root,
        workspace: target.name, commitID: target.commitID, busy: (session.time.busy ?? 0) > (session.time.idle ?? 0) })
    }
    cursor = page.cursor.next ?? undefined
  } while (cursor && count < MAX_SESSIONS && pages < MAX_SESSIONS / 100)
  signal.throwIfAborted()
  return { worktreeSessions: sessions, worktreeSessionsTruncated: !!cursor }
}

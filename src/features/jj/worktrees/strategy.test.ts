import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { access, chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { createJJWorktreeStrategy } from "./strategy"
import { worktreeOptions } from "./options"
import { jjRepository } from "./repository"
import { setupJJWorktrees } from "./server"
import type { Plugin } from "@opencode/plugin"
import type { WorktreeDefinition } from "@opencode/plugin/promise/worktree"

const execute = promisify(execFile)
const context = () => ({ signal: new AbortController().signal })
const defaults = worktreeOptions(undefined)!

async function fixture(work: (f: { base: string; root: string; jj(args: string[], cwd?: string): Promise<string> }) => Promise<void>) {
  const parent = join(tmpdir(), "opencode")
  await mkdir(parent, { recursive: true })
  const base = await realpath(await mkdtemp(join(parent, "jello-worktrees-")))
  const root = join(base, "main repo")
  const jj = async (args: string[], cwd = root) => (await execute("jj", ["--config", "user.name=Jello Test", "--config", "user.email=test@example.invalid", ...args], { cwd })).stdout
  try {
    await execute("jj", ["git", "init", root])
    await writeFile(join(root, ".gitignore"), "build/\n")
    await writeFile(join(root, "tracked.txt"), "base\n")
    await jj(["commit", "-m", "base"])
    await work({ base, root, jj })
  } finally { await rm(base, { recursive: true, force: true }) }
}

test("JJ worktree options validate budgets and offer an opt-out", () => {
  assert.equal(worktreeOptions(false), undefined)
  assert.equal(defaults.sparsePatterns, "copy")
  assert.equal(defaults.start, "current")
  for (const value of [null, [], "yes", { writeTimeoutMs: 0 }, { maxOutputBytes: Infinity }, { colocate: "yes" }, { start: "head" }, { unknown: true }]) {
    assert.throws(() => worktreeOptions(value))
  }
  assert.equal(worktreeOptions({ writeTimeoutMs: 900_000 })!.writeTimeoutMs, 900_000)
})

test("create snapshots current work once, creates a fresh child and lists without snapshotting", { timeout: 30_000 }, async () => fixture(async ({ base, root, jj }) => {
  const strategy = createJJWorktreeStrategy(root, defaults)
  await writeFile(join(root, "tracked.txt"), "source edits\n")
  const directory = join(base, "task with spaces ☃")
  assert.deepEqual(await strategy.create({ sourceDirectory: root, directory }, context()), { directory })
  assert.equal(await readFile(join(directory, "tracked.txt"), "utf8"), "source edits\n")
  const original = await jj(["log", "--no-graph", "--ignore-working-copy", "-r", "@", "-T", "commit_id"])
  const parent = await jj(["log", "--no-graph", "--ignore-working-copy", "-r", "@-", "-T", "commit_id"], directory)
  assert.equal(parent, original)
  assert.notEqual(await jj(["log", "--no-graph", "--ignore-working-copy", "-r", "@", "-T", "commit_id"], directory), original)
  await access(join(directory, ".git"))
  await writeFile(join(directory, "tracked.txt"), "not snapshotted by list\n")
  const before = await jj(["op", "log", "--ignore-working-copy", "--limit", "1", "--no-graph", "-T", "id"])
  const list = await strategy.list(directory, context())
  const after = await jj(["op", "log", "--ignore-working-copy", "--limit", "1", "--no-graph", "-T", "id"])
  assert.equal(after, before)
  assert.deepEqual(list, [{ directory: root, type: "root" }, { directory, type: "worktree" }])
}))

test("explicit refs, sparse copy, alternate sparse modes and sibling starts", { timeout: 30_000 }, async () => fixture(async ({ base, root, jj }) => {
  await jj(["bookmark", "set", "base", "-r", "@-"])
  await jj(["sparse", "set", "--clear", "--add", "tracked.txt"])
  const strategy = createJJWorktreeStrategy(root, defaults)
  const directory = join(base, "sparse")
  await strategy.create({ sourceDirectory: root, directory, branch: "base" }, context())
  assert.equal(await jj(["sparse", "list"], directory), await jj(["sparse", "list"]))
  assert.equal(await jj(["log", "--no-graph", "--ignore-working-copy", "-r", "@-", "-T", "commit_id"], directory), await jj(["log", "--no-graph", "--ignore-working-copy", "-r", "base", "-T", "commit_id"]))
  await assert.rejects(strategy.create({ sourceDirectory: root, directory: join(base, "multi"), branch: "all()" }, context()), /exactly one/)
  await assert.rejects(strategy.create({ sourceDirectory: root, directory: join(base, "flag"), branch: "--help" }, context()))
  const empty = join(base, "empty")
  await createJJWorktreeStrategy(root, { ...defaults, sparsePatterns: "empty" }).create({ sourceDirectory: root, directory: empty }, context())
  await assert.rejects(access(join(empty, "tracked.txt")))
  const sibling = join(base, "sibling")
  await createJJWorktreeStrategy(root, { ...defaults, start: "parents" }).create({ sourceDirectory: root, directory: sibling }, context())
  assert.equal(await jj(["log", "--no-graph", "--ignore-working-copy", "-r", "@-", "-T", "commit_id"], sibling), await jj(["log", "--no-graph", "--ignore-working-copy", "-r", "@-", "-T", "commit_id"]))
}))

test("remove protects changes and ignored files, and force uses JJ to forget and remove", { timeout: 30_000 }, async () => fixture(async ({ base, root, jj }) => {
  const strategy = createJJWorktreeStrategy(root, defaults)
  const directory = join(base, "remove-me")
  await strategy.create({ sourceDirectory: root, directory }, context())
  await mkdir(join(directory, "build"))
  await writeFile(join(directory, "build", "valuable.txt"), "ignored")
  await assert.rejects(strategy.remove({ directory, force: false }, context()), (error: unknown) => (error as { forceRequired: boolean }).forceRequired === true)
  await access(join(directory, "build", "valuable.txt"))
  await writeFile(join(directory, "tracked.txt"), "preserve this commit\n")
  await assert.rejects(strategy.remove({ directory, force: false }, context()), (error: unknown) => (error as { forceRequired: boolean }).forceRequired === true)
  await strategy.remove({ directory, force: true }, context())
  await assert.rejects(access(directory))
  assert.equal((await strategy.list(root, context())).length, 1)
  assert.match(await jj(["log", "--ignore-working-copy", "--no-graph", "-r", "all()", "-T", "description"]), /base/)
  const { stdout } = await execute("jj", ["--ignore-working-copy", "log", "--no-graph", "-r", "all()", "-T", 'commit_id ++ "\\n"'], { cwd: root })
  const contents = await Promise.all(stdout.trim().split("\n").map(async (id) => {
    try { return await jj(["file", "show", "--ignore-working-copy", "-r", id, "tracked.txt"]) } catch { return "" }
  }))
  assert.ok(contents.includes("preserve this commit\n"), "force removal must snapshot tracked edits before deleting the checkout")
  const clean = join(base, "clean")
  await strategy.create({ sourceDirectory: root, directory: clean }, context())
  await strategy.remove({ directory: clean, force: false }, context())
  await assert.rejects(access(clean))
}))

test("sparse checkout removal requires confirmation even for an empty change", { timeout: 30_000 }, async () => fixture(async ({ base, root }) => {
  const strategy = createJJWorktreeStrategy(root, { ...defaults, sparsePatterns: "empty" })
  const directory = join(base, "sparse-remove")
  await strategy.create({ sourceDirectory: root, directory }, context())
  // This path exists in the repo but is outside the JJ sparse checkout.
  await writeFile(join(directory, "tracked.txt"), "not snapshotted by sparse JJ\n")
  await assert.rejects(strategy.remove({ directory, force: false }, context()), (error: unknown) => (error as { forceRequired: boolean; message: string }).forceRequired && /sparse/.test((error as Error).message))
  assert.equal(await readFile(join(directory, "tracked.txt"), "utf8"), "not snapshotted by sparse JJ\n")
}))

test("queued cancellation cannot mutate later or block subsequent operations", { timeout: 30_000 }, async () => fixture(async ({ base, root }) => {
  let entered!: () => void; let release!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  const held = new Promise<void>((resolve) => { release = resolve })
  const strategy = createJJWorktreeStrategy(root, defaults, async () => { entered(); await held })
  const other = createJJWorktreeStrategy(root, defaults)
  const directory = join(base, "held")
  await strategy.create({ sourceDirectory: root, directory }, context())
  const removal = strategy.remove({ directory, force: true }, context())
  await started
  const controller = new AbortController()
  const cancelled = other.create({ sourceDirectory: root, directory: join(base, "cancelled") }, { signal: controller.signal })
  controller.abort(new Error("queued cancellation"))
  try { await assert.rejects(cancelled, /queued cancellation/) } finally { release() }
  await removal
  await other.create({ sourceDirectory: root, directory: join(base, "next") }, context())
  await assert.rejects(access(join(base, "cancelled")))
}))

test("a custom JJ executable respects read timeouts and in-flight cancellation", { timeout: 30_000 }, async () => fixture(async ({ base, root }) => {
  const command = join(base, "slow-jj")
  await writeFile(command, "#!/bin/sh\nexec sleep 30\n")
  await chmod(command, 0o755)
  const strategy = createJJWorktreeStrategy(root, { ...defaults, command, readTimeoutMs: 50 })
  await assert.rejects(strategy.create({ sourceDirectory: root, directory: join(base, "timed-out") }, context()))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error("in-flight cancellation")), 50)
  try {
    const cancellable = createJJWorktreeStrategy(root, { ...defaults, command })
    await assert.rejects(cancellable.create({ sourceDirectory: root, directory: join(base, "aborted") }, { signal: controller.signal }))
  } finally { clearTimeout(timer) }
  await assert.rejects(access(join(base, "timed-out")))
  await assert.rejects(access(join(base, "aborted")))
}))

test("refuse canonical roots, unrelated repositories, subdirectories, symlinks and overlapping destinations", { timeout: 30_000 }, async () => fixture(async ({ base, root }) => {
  const strategy = createJJWorktreeStrategy(root, defaults)
  await assert.rejects(strategy.remove({ directory: root, force: true }, context()), /main or canonical/)
  await assert.rejects(strategy.create({ sourceDirectory: root, directory: join(root, "nested") }, context()), /overlap/)
  await assert.rejects(strategy.create({ sourceDirectory: root, directory: root }, context()), /already exists/)
  const directory = join(base, "secondary")
  await strategy.create({ sourceDirectory: root, directory }, context())
  const sub = join(directory, "sub"); await mkdir(sub)
  await assert.rejects(strategy.remove({ directory: sub, force: true }, context()), /exact/)
  const alias = join(base, "alias"); await symlink(directory, alias)
  await assert.rejects(strategy.remove({ directory: alias, force: true }, context()), /symlink/)
  const other = join(base, "unrelated"); await execute("jj", ["git", "init", other])
  await assert.rejects(strategy.remove({ directory: other, force: true }, context()), /does not belong/)
  await assert.rejects(strategy.create({ sourceDirectory: other, directory: join(base, "bad") }, context()), /does not belong/)
  const blocked = createJJWorktreeStrategy(root, defaults, async () => { throw new Error("Running session") })
  await assert.rejects(blocked.remove({ directory, force: true }, context()), /Running session/)
  await access(directory)
}))

test("non-colocated and renamed workspaces, duplicate basenames, missing roots and cancellation", { timeout: 30_000 }, async () => fixture(async ({ base, root, jj }) => {
  const strategy = createJJWorktreeStrategy(root, { ...defaults, colocate: false })
  await mkdir(join(base, "one")); await mkdir(join(base, "two"))
  const a = join(base, "one", "task"); const b = join(base, "two", "task")
  await Promise.all([strategy.create({ sourceDirectory: root, directory: a }, context()), strategy.create({ sourceDirectory: root, directory: b }, context())])
  await assert.rejects(access(join(a, ".git")))
  assert.equal((await jjRepository(a))!.store, (await jjRepository(root))!.store)
  await jj(["workspace", "rename", "renamed workspace"], a)
  await strategy.remove({ directory: a, force: true }, context())
  await rm(b, { recursive: true, force: true })
  assert.deepEqual(await strategy.list(root, context()), [{ directory: root, type: "root" }])
  const controller = new AbortController(); controller.abort(new Error("cancelled"))
  await assert.rejects(strategy.create({ sourceDirectory: root, directory: join(base, "cancelled") }, { signal: controller.signal }), /cancelled/)
  await assert.rejects(access(join(base, "cancelled")))
}))

test("setup registers only for JJ and supports disabling without touching a broken repository", async () => fixture(async ({ root, base }) => {
  let registered = 0
  const ctx = (directory: string, options: unknown = {}) => ({
    options, location: { project: { canonical: directory } },
    worktree: { transform: async (fn: (editor: { add(): void }) => void) => fn({ add: () => { registered++ } }) },
  }) as unknown as Plugin.Context
  await setupJJWorktrees(ctx(root))
  assert.equal(registered, 1)
  await setupJJWorktrees(ctx(base))
  await setupJJWorktrees(ctx("/does-not-exist", { jjWorktrees: false }))
  assert.equal(registered, 1)
  const broken = join(base, "broken")
  await mkdir(join(broken, ".jj"), { recursive: true })
  await assert.rejects(setupJJWorktrees(ctx(broken)), /metadata is incomplete/)
  assert.equal(registered, 1)
}))

test("server registration protects busy sessions across pages, including force removal", { timeout: 30_000 }, async () => fixture(async ({ base, root }) => {
  let registered!: WorktreeDefinition
  let busy = true
  const pages: unknown[] = []
  const directory = join(base, "session-workspace")
  await setupJJWorktrees({
    options: {}, location: { project: { canonical: root, id: "project" } },
    worktree: { transform: async (fn: (editor: { add(strategy: WorktreeDefinition): void }) => void) => fn({ add: (strategy) => { registered = strategy } }) },
    session: { list: async (input: { cursor?: string }) => {
      pages.push(input)
      return input.cursor ? {
        data: [{ time: { busy: 20, idle: busy ? 10 : 20 }, location: { directory } }], cursor: {},
      } : { data: [], cursor: { next: "page-2" } }
    } },
  } as unknown as Plugin.Context)
  await registered.create({ sourceDirectory: root, directory }, context())
  await assert.rejects(registered.remove({ directory, force: true }, context()), /running OpenCode session/)
  await access(directory)
  assert.deepEqual(pages, [{ project: "project", limit: 100 }, { cursor: "page-2", limit: 100 }])
  busy = false
  await registered.remove({ directory, force: false }, context())
  await assert.rejects(access(directory))
}))

test("unidentified global projects cannot create under an unstable project identity", async () => fixture(async ({ root, base }) => {
  let registered!: WorktreeDefinition
  await setupJJWorktrees({
    options: {}, location: { project: { canonical: root, id: "global" } },
    worktree: { transform: async (fn: (editor: { add(strategy: WorktreeDefinition): void }) => void) => fn({ add: (strategy) => { registered = strategy } }) },
  } as unknown as Plugin.Context)
  await assert.rejects(registered.create({ sourceDirectory: root, directory: join(base, "no-project") }, context()), /initial commit/)
  await assert.rejects(access(join(base, "no-project")))
}))

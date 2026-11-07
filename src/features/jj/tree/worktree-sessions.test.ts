import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import type { Plugin } from "@opencode/plugin"
import { readWorktreeSessions } from "./worktree-sessions-server"
import { worktreeSessionGroups, type WorktreeSession } from "./worktree-sessions"

const execute = promisify(execFile)
const signal = () => new AbortController().signal

test("worktree session badges use exact commits, exclude self and retain out-of-view positions", () => {
  const session = (sessionID: string, commitID: string): WorktreeSession => ({ sessionID, commitID,
    title: sessionID, directory: "/worktree", workspace: "worktree", busy: false })
  const result = worktreeSessionGroups([session("self", "a"), session("other", "a"), session("third", "a"), session("divergent", "b")], "self", new Set(["a"]))
  assert.deepEqual(result.rows.get("a")!.map((session) => session.sessionID), ["other", "third"])
  assert.equal(result.rows.has("b"), false)
  assert.equal(result.outside[0].sessionID, "divergent")
  assert.deepEqual(worktreeSessionGroups([], "other", new Set()).outside, [])
})

test("session positions use shared JJ metadata without snapshotting other workspaces", { timeout: 30_000 }, async () => {
  const parent = join(tmpdir(), "opencode")
  await mkdir(parent, { recursive: true })
  const base = await realpath(await mkdtemp(join(parent, "jello-session-positions-")))
  const root = join(base, "main"); const worktree = join(base, "task with spaces")
  const jj = async (args: string[], cwd = root) => (await execute("jj", ["--config", "user.name=Test", "--config", "user.email=test@example.invalid", ...args], { cwd })).stdout
  try {
    await execute("jj", ["git", "init", root])
    await writeFile(join(root, "file"), "base\n")
    await jj(["commit", "-m", "base"])
    await jj(["workspace", "add", "--name", "other workspace", worktree])
    const commitID = await jj(["log", "--ignore-working-copy", "--no-graph", "-r", "@", "-T", "commit_id"], worktree)
    await writeFile(join(worktree, "file"), "unsnapshotted edits\n")
    await mkdir(join(worktree, "sub"))
    const alias = join(base, "alias"); await symlink(worktree, alias)
    const session = (id: string, directory: string, extra = {}) => ({ id, location: { directory }, title: id, time: {}, ...extra })
    let rows = [session("local", root), session("other", worktree, { time: { busy: 20, idle: 10 } }), session("subdir", join(worktree, "sub")),
      session("alias", alias), session("unrelated", join(base, "not-a-worktree")), session("archived", worktree, { time: { archived: 1 } }), session("child", worktree, { parentID: "other" })]
    const requests: unknown[] = []
    const ctx = {
      location: { project: { id: "project", canonical: root } },
      session: { list: async (input: { cursor?: string }) => {
        requests.push(input)
        return input.cursor ? { data: rows.slice(2), cursor: {} } : { data: rows.slice(0, 2), cursor: { next: "next" } }
      } },
    } as unknown as Plugin.Context
    const before = await jj(["op", "log", "--ignore-working-copy", "--limit", "1", "--no-graph", "-T", "id"])
    const result = await readWorktreeSessions(ctx, root, signal())
    assert.deepEqual(result.worktreeSessions.map((session) => session.sessionID), ["other", "subdir", "alias"])
    assert.ok(result.worktreeSessions.every((session) => session.commitID === commitID && session.directory === worktree && session.workspace === "other workspace"))
    assert.equal(result.worktreeSessions[0].busy, true)
    assert.equal(result.worktreeSessionsTruncated, false)
    assert.deepEqual(requests[0], { project: "project", parentID: null, archived: false, limit: 100, order: "desc" })
    assert.equal(await jj(["op", "log", "--ignore-working-copy", "--limit", "1", "--no-graph", "-T", "id"]), before)
    rows = [session("other", root)]
    assert.deepEqual((await readWorktreeSessions(ctx, root, signal())).worktreeSessions, [], "moving a session back removes its worktree marker")
    const abort = new AbortController(); abort.abort(new Error("cancelled"))
    await assert.rejects(readWorktreeSessions(ctx, root, abort.signal), /cancelled/)
  } finally { await rm(base, { recursive: true, force: true }) }
})

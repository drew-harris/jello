import { strict as assert } from "node:assert"
import { execFile, spawnSync } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { readTree } from "./server"

const execute = promisify(execFile)
const available = spawnSync("jj", ["--version"]).status === 0

test("real JJ template returns metadata and respects the configured default log revset", { skip: !available }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-tree-"))
  const jj = (args: string[]) => execute("jj", ["--config", 'user.name="Tree Test"', "--config", 'user.email="tree@example.com"', ...args], { cwd: directory })
  try {
    await jj(["git", "init"])
    await jj(["config", "set", "--repo", "revsets.log", "::"])
    const description = 'Fix "quotes" → done\n\nMore details'
    await jj(["describe", "-m", description])
    await jj(["bookmark", "create", "feature/tree"])
    await jj(["new", "-m", "Second"])
    const history = await readTree(directory, 20)
    assert.equal(history.hasMore, false)
    assert.equal(history.commits.length, 3)
    assert.equal(history.commits[0].current, true)
    assert.equal(typeof history.commits[0].changeID, "string")
    assert.ok(history.commits[0].changeID.length > 8)
    assert.ok(history.commits[0].changeIDPrefix.length > 0)
    assert.ok(history.commits[0].changeID.startsWith(history.commits[0].changeIDPrefix))
    assert.ok(history.commits[0].changeIDPrefix.length < history.commits[0].changeID.length)
    assert.equal(history.commits[0].author, "Tree Test")
    assert.equal(history.commits[0].parents[0], history.commits[1].commitID)
    assert.equal(history.commits[1].description.trim(), description)
    assert.deepEqual(history.commits[1].bookmarks, ["feature/tree"])
    assert.deepEqual(history.commits[1].bookmarkLabels, ["feature/tree"])
    assert.deepEqual(history.commits[2].parents, [])
    const limited = await readTree(directory, 1)
    assert.equal(limited.hasMore, true)
    assert.equal(limited.commits.length, 1)
    await jj(["config", "set", "--repo", "revsets.log", "@"])
    const filtered = await readTree(directory, 20)
    assert.equal(filtered.commits.length, 1)
    assert.equal(filtered.hasMore, false)
    assert.equal(filtered.commits[0].parents.length, 1)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("tree distinguishes moved local bookmarks from remote positions and collapses synced refs", { skip: !available }, async () => {
  const base = await mkdtemp(join(tmpdir(), "jello-tree-remotes-"))
  const directory = join(base, "repo")
  const remote = join(base, "remote.git")
  const jj = async (args: string[]) => (await execute("jj", [
    "--config", 'user.name="Tree Test"', "--config", 'user.email="tree@example.com"', ...args,
  ], { cwd: directory })).stdout.trim()
  try {
    await mkdir(directory)
    await execute("git", ["init", "--bare", remote])
    await jj(["git", "init"])
    await jj(["config", "set", "--repo", "revsets.log", "::"])
    await jj(["git", "remote", "add", "origin", remote])
    await jj(["describe", "-m", "Published"])
    await jj(["bookmark", "create", "main"])
    await jj(["git", "push", "--remote", "origin", "--bookmark", "main", "--allow-new"])
    const published = await jj(["log", "--no-graph", "-r", "main", "-T", "commit_id"])
    const synced = await readTree(directory, 20)
    assert.deepEqual(synced.commits.find((c) => c.commitID === published)?.bookmarkLabels, ["main"])

    await jj(["new", "main", "-m", "Local advance"])
    await jj(["bookmark", "set", "main", "-r", "@"])
    const moved = await readTree(directory, 20)
    assert.deepEqual(moved.commits[0].bookmarks, ["main"])
    assert.deepEqual(moved.commits[0].bookmarkLabels, ["main*"])
    assert.deepEqual(moved.commits[0].remoteBookmarkLabels, [])
    const remoteCommit = moved.commits.find((c) => c.commitID === published)!
    assert.deepEqual(remoteCommit.bookmarks, [])
    assert.deepEqual(remoteCommit.bookmarkLabels, ["main@origin"])
    assert.deepEqual(remoteCommit.remoteBookmarkLabels, ["main@origin"])

    await jj(["git", "push", "--remote", "origin", "--bookmark", "main"])
    const pushed = await readTree(directory, 20)
    assert.deepEqual(pushed.commits.find((c) => c.bookmarks.includes("main"))?.bookmarkLabels, ["main"])
    assert.deepEqual(pushed.commits.find((c) => c.commitID === published)?.bookmarkLabels, [])
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test("non-JJ directories surface a useful repository error", { skip: !available }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-tree-not-repo-"))
  try {
    await assert.rejects(readTree(directory, 20), /not.*(?:jj|repo)|no.*repo/i)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { pushChange } from "./push"

const execute = promisify(execFile)

test("push validates commit IDs before running JJ", async () => {
  await assert.rejects(pushChange("/nonexistent", "all()"), /full commit ID/)
  await assert.rejects(pushChange("/nonexistent", "0".repeat(40)), /root commit/)
})

test("push creates and tracks only selected bookmarks, then updates tracked bookmarks", async () => {
  const base = await mkdtemp(join(tmpdir(), "jello-push-"))
  const directory = join(base, "repo")
  const remote = join(base, "remote.git")
  const jj = async (args: string[]) => (await execute("jj", args, { cwd: directory })).stdout.trim()
  const ref = async (name: string) => (await execute("git", ["--git-dir", remote, "rev-parse", `refs/heads/${name}`])).stdout.trim()
  try {
    await mkdir(directory)
    await execute("git", ["init", "--bare", remote])
    await jj(["git", "init"])
    await jj(["config", "set", "--repo", "user.name", "Jello Test"])
    await jj(["config", "set", "--repo", "user.email", "test@example.com"])
    await jj(["git", "remote", "add", "origin", remote])
    await jj(["describe", "-m", "First change"])
    const first = await jj(["log", "--no-graph", "-r", "@", "-T", "commit_id"])
    await assert.rejects(pushChange(directory, first), /Set a bookmark/)
    await jj(["bookmark", "create", "feature", "feature-other", "other"])
    await jj(["new", "-m", "Second change"])
    await jj(["bookmark", "set", "feature", "-r", "@"])
    const second = await jj(["log", "--no-graph", "-r", "@", "-T", "commit_id"])
    await pushChange(directory, second)
    assert.equal(await ref("feature"), second)
    await assert.rejects(ref("feature-other"))
    await assert.rejects(ref("other"))
    assert.match(await jj(["bookmark", "list", "--tracked"]), /feature/)
    await jj(["new", "-m", "Third change"])
    await jj(["bookmark", "set", "feature", "-r", "@"])
    const third = await jj(["log", "--no-graph", "-r", "@", "-T", "commit_id"])
    await pushChange(directory, third)
    assert.equal(await ref("feature"), third)
    await jj(["bookmark", "create", "second-name"])
    await pushChange(directory, third)
    assert.equal(await ref("second-name"), third)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

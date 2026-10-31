import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { abandon } from "./abandon"
import { readTree } from "./server"

const execute = promisify(execFile)

test("abandon rejects revsets, flags, and abbreviated IDs before running JJ", async () => {
  for (const revision of ["@", "all()", "--ignore-immutable", "abc123", "a".repeat(41), "g".repeat(40)]) {
    await assert.rejects(abandon("/nonexistent/jello-test", revision), /full commit ID/)
  }
})

test("abandon targets the exact commit and rebases descendants; immutable protection remains active", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-abandon-"))
  const jj = (args: string[]) => execute("jj", args, { cwd: directory })
  try {
    await jj(["git", "init"])
    await jj(["config", "set", "--repo", "user.name", "Jello Test"])
    await jj(["config", "set", "--repo", "user.email", "test@example.com"])
    await jj(["config", "set", "--repo", "revsets.log", "::"])
    await jj(["describe", "-m", "Abandon me"])
    await jj(["new", "-m", "Keep me"])
    const before = await readTree(directory, 20)
    const target = before.commits[1]
    const root = before.commits[2]
    await abandon(directory, target.commitID)
    const after = await readTree(directory, 20)
    assert.equal(after.commits.length, 2)
    assert.ok(!after.commits.some((commit) => commit.commitID === target.commitID))
    assert.equal(after.commits[0].description.trim(), "Keep me")
    assert.equal(after.commits[0].changeID, before.commits[0].changeID)
    assert.deepEqual(after.commits[0].parents, [root.commitID])
    await assert.rejects(abandon(directory, root.commitID), /immutable|root/i)

    await abandon(directory, after.commits[0].commitID)
    const current = await readTree(directory, 20)
    assert.equal(current.commits[0].current, true)
    assert.equal(current.commits[0].empty, true)
    assert.notEqual(current.commits[0].changeID, after.commits[0].changeID)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

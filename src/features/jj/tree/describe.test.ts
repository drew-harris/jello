import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { describe } from "./describe"
import { readTree } from "./server"

const execute = promisify(execFile)

test("describe rejects revsets and multiline input before running JJ", async () => {
  await assert.rejects(describe("/nonexistent/jello-test", "@", "Message"), /full commit ID/)
  await assert.rejects(describe("/nonexistent/jello-test", "a".repeat(40), "First\nSecond"), /single-line/)
})

test("describe updates an exact commit with a literal message and supports clearing it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-describe-"))
  const jj = (args: string[]) => execute("jj", args, { cwd: directory })
  try {
    await jj(["git", "init"])
    await jj(["config", "set", "--repo", "user.name", "Jello Test"])
    await jj(["config", "set", "--repo", "user.email", "test@example.com"])
    await jj(["config", "set", "--repo", "revsets.log", "::"])
    await jj(["describe", "-m", "Original"])
    await jj(["new", "-m", "Descendant"])
    const before = await readTree(directory, 20)
    const message = 'Update "quotes" → $(not-a-shell)'
    await describe(directory, before.commits[1].commitID, message)
    const after = await readTree(directory, 20)
    assert.equal(after.commits[1].description.trim(), message)
    assert.equal(after.commits[1].changeID, before.commits[1].changeID)
    assert.notEqual(after.commits[1].commitID, before.commits[1].commitID)
    assert.equal(after.commits[0].description.trim(), "Descendant")
    assert.deepEqual(after.commits[0].parents, [after.commits[1].commitID])
    await assert.rejects(describe(directory, after.commits[2].commitID, "Root"), /immutable|root/i)
    await describe(directory, after.commits[1].commitID, "")
    assert.equal((await readTree(directory, 20)).commits[1].description.trim(), "")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

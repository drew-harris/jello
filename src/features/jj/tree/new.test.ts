import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { newChange } from "./new"
import { readTree } from "./server"

const execute = promisify(execFile)

test("jj new creates an empty working copy on the previous working-copy commit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-new-"))
  const jj = (args: string[]) => execute("jj", args, { cwd: directory })
  try {
    await jj(["git", "init"])
    await jj(["config", "set", "--repo", "user.name", "Jello Test"])
    await jj(["config", "set", "--repo", "user.email", "test@example.com"])
    await jj(["config", "set", "--repo", "revsets.log", "::"])
    await writeFile(join(directory, "example.txt"), "Keep working-copy contents\n")
    const before = await readTree(directory, 20)
    await newChange(directory)
    const after = await readTree(directory, 20)
    assert.equal(after.commits.length, before.commits.length + 1)
    assert.equal(after.commits[0].current, true)
    assert.equal(after.commits[0].empty, true)
    assert.equal(after.commits[0].description, "")
    assert.deepEqual(after.commits[0].parents, [before.commits[0].commitID])
    assert.equal(after.commits[1].changeID, before.commits[0].changeID)
    assert.equal(after.commits[1].empty, false)
    const file = await jj(["file", "show", "example.txt"])
    assert.equal(file.stdout, "Keep working-copy contents\n")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

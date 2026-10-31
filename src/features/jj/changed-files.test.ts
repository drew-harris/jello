import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { readChangedFiles } from "./changed-files"

const execute = promisify(execFile)

test("reads fresh working-copy additions, modifications, and deletions safely", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-files-"))
  try {
    await execute("jj", ["git", "init", directory])
    assert.deepEqual(await readChangedFiles(directory), [])
    await writeFile(join(directory, "modified.txt"), "before\n")
    await writeFile(join(directory, "deleted.txt"), "before\n")
    await execute("jj", ["commit", "-m", "Initial", "--config", 'user.name="Test"', "--config", 'user.email="test@example.com"'], { cwd: directory })
    await writeFile(join(directory, "modified.txt"), "after\n")
    await rm(join(directory, "deleted.txt"))
    const unusualPath = 'added "file"\nname.txt'
    await writeFile(join(directory, unusualPath), "new\n")
    const files = await readChangedFiles(directory)
    assert.equal(files.length, 3)
    assert.ok(files.some((file) => file.path === unusualPath && file.status.toLowerCase().startsWith("a")))
    assert.ok(files.some((file) => file.path === "modified.txt" && file.status.toLowerCase().startsWith("m")))
    assert.ok(files.some((file) => file.path === "deleted.txt" && file.status === "removed"))
    const { stdout } = await execute("jj", ["log", "--no-graph", "-r", "@-", "-T", "commit_id"], { cwd: directory })
    const historical = await readChangedFiles(directory, undefined, stdout.trim())
    assert.equal(historical.length, 2)
    assert.ok(historical.every((file) => file.status === "added"))
    assert.ok(!historical.some((file) => file.path === unusualPath))
    assert.deepEqual(await readChangedFiles(directory, undefined, "0".repeat(40)), [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("revision file reads reject revsets before running JJ", async () => {
  await assert.rejects(readChangedFiles("/nonexistent/jello-test", undefined, "all()"), /full commit ID/)
})

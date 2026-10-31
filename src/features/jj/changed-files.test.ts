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
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

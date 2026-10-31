import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { commit } from "./commit"

const execute = promisify(execFile)

test("rejects blank messages before running jj", async () => {
  await assert.rejects(commit("/nonexistent/jello-test", " \n "), /Enter a commit message/)
})

test("commits with a literal message and creates a new empty working copy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-commit-"))
  try {
    await execute("jj", ["git", "init", directory])
    await execute("jj", ["config", "set", "--repo", "user.name", "Jello Test"], { cwd: directory })
    await execute("jj", ["config", "set", "--repo", "user.email", "test@example.com"], { cwd: directory })
    await writeFile(join(directory, "example.txt"), "hello\n")
    const message = 'Add example; $(echo not-a-shell) "quoted"'
    await commit(directory, message)
    const { stdout } = await execute("jj", ["log", "--no-graph", "-r", "@-", "-T", "description"], { cwd: directory })
    assert.equal(stdout.trim(), message)
    const result = await execute("jj", ["log", "--no-graph", "-r", "@", "-T", "empty"], { cwd: directory })
    assert.equal(result.stdout.trim(), "true")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

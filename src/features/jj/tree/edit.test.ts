import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { editChange } from "./edit"
import { readTree } from "./server"

const execute = promisify(execFile)

test("edit rejects revsets, options, and abbreviated IDs before running JJ", async () => {
  for (const id of ["@", "all()", "--ignore-immutable", "abc123"]) {
    await assert.rejects(editChange("/nonexistent/jello-test", id), /full commit ID/)
  }
})

test("edit switches the working copy to the exact change without bypassing immutable protection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-edit-"))
  const jj = (args: string[]) => execute("jj", args, { cwd: directory })
  try {
    await jj(["git", "init"])
    await jj(["config", "set", "--repo", "user.name", "Jello Test"])
    await jj(["config", "set", "--repo", "user.email", "test@example.com"])
    await jj(["config", "set", "--repo", "revsets.log", "::"])
    await writeFile(join(directory, "example.txt"), "before\n")
    await jj(["commit", "-m", "Base"])
    await writeFile(join(directory, "example.txt"), "after\n")
    await jj(["commit", "-m", "Later"])
    const before = await readTree(directory, 20)
    const target = before.commits.find((commit) => commit.description.trim() === "Base")!
    await editChange(directory, target.commitID)
    const after = await readTree(directory, 20)
    assert.equal(after.commits.find((commit) => commit.current)?.commitID, target.commitID)
    assert.equal(await readFile(join(directory, "example.txt"), "utf8"), "before\n")
    assert.ok(after.commits.some((commit) => commit.description.trim() === "Later"))
    await assert.rejects(editChange(directory, "0".repeat(40)), /immutable|root/i)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

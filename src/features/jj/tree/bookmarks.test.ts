import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { listBookmarks, setBookmark } from "./bookmarks"
import { readTree } from "./server"

const execute = promisify(execFile)

test("bookmark setting validates commit IDs and names before running JJ", async () => {
  await assert.rejects(setBookmark("/nonexistent", "all()", "main"), /full commit ID/)
  for (const name of ["", "  ", "a\nb", "a\0b"]) {
    await assert.rejects(setBookmark("/nonexistent", "a".repeat(40), name), /bookmark name/)
  }
})

test("an already-cancelled bookmark read rejects without starting a command", async () => {
  const controller = new AbortController()
  controller.abort(new Error("cancelled"))
  await assert.rejects(listBookmarks("/nonexistent", controller.signal), /cancelled/)
})

test("bookmarks list is cached, creates names, and moves an existing bookmark backwards", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-bookmarks-"))
  const jj = (args: string[]) => execute("jj", args, { cwd: directory })
  try {
    await jj(["git", "init"])
    await jj(["config", "set", "--repo", "user.name", "Jello Test"])
    await jj(["config", "set", "--repo", "user.email", "test@example.com"])
    await jj(["config", "set", "--repo", "revsets.log", "::"])
    const pending = listBookmarks(directory)
    assert.equal(listBookmarks(directory), pending)
    assert.deepEqual(await pending, [])
    const before = await readTree(directory, 20)
    const parent = before.commits[0].commitID
    await setBookmark(directory, parent, "feature/tree")
    assert.deepEqual(await listBookmarks(directory), ["feature/tree"])
    await jj(["new"])
    const current = (await readTree(directory, 20)).commits.find((commit) => commit.current)!
    await setBookmark(directory, current.commitID, "feature/tree")
    assert.ok((await readTree(directory, 20)).commits.find((commit) => commit.commitID === current.commitID)?.bookmarks.includes("feature/tree"))
    await setBookmark(directory, parent, "feature/tree")
    assert.ok((await readTree(directory, 20)).commits.find((commit) => commit.commitID === parent)?.bookmarks.includes("feature/tree"))
    await setBookmark(directory, current.commitID, "another")
    assert.deepEqual(await listBookmarks(directory), ["another", "feature/tree"])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

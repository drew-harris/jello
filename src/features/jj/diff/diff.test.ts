import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { parsePatchFiles } from "@pierre/diffs"
import { commit } from "../commit"
import { readRevisionDiff } from "./server"
import { diffFileIndex, diffTabID, parseDiffTabID } from "./tab"

const execute = promisify(execFile)

test("diff tabs preserve the exact revision and directory across restores", () => {
  const target = { commitID: "a".repeat(40), directory: "/project with spaces/ü#%/checkout" }
  assert.deepEqual(parseDiffTabID(diffTabID(target)), target)
  for (const id of ["jj", "jj-diff/@/dir", `jj-diff/${target.commitID}/%zz`, `jj-diff/${target.commitID}/x/extra`]) {
    assert.equal(parseDiffTabID(id), undefined)
  }
})

test("file-targeted diff tabs preserve paths and stay distinct from full revision tabs", () => {
  const target = { commitID: "b".repeat(40), directory: "/repo/space ü#%", file: 'src/a "quoted" file\nname.ts' }
  const id = diffTabID(target)
  assert.deepEqual(parseDiffTabID(id), target)
  assert.notEqual(id, diffTabID({ directory: target.directory, commitID: target.commitID }))
  assert.notEqual(id, diffTabID({ ...target, file: "src/other.ts" }))
  const base = diffTabID({ directory: target.directory, commitID: target.commitID })
  for (const suffix of ["/file/", "/file/%zz", "/file/x/extra", "/unknown/x"]) {
    assert.equal(parseDiffTabID(base + suffix), undefined)
  }
})

test("file selection matches exact paths, including deleted and renamed files", () => {
  const files = [{ name: "src/a.ts" }, { name: "src/b.ts" }, { name: "new.ts", prevName: "old.ts" }, { name: "deleted.ts" }]
  assert.equal(diffFileIndex(files), 0)
  assert.equal(diffFileIndex(files, "src/b.ts"), 1)
  assert.equal(diffFileIndex(files, "new.ts"), 2)
  assert.equal(diffFileIndex(files, "old.ts"), 2)
  assert.equal(diffFileIndex(files, "deleted.ts"), 3)
  assert.equal(diffFileIndex(files, "missing.ts"), -1)
})

test("rejects arbitrary revision expressions before executing jj", async () => {
  await assert.rejects(readRevisionDiff("/nonexistent", "@ | all()"), /Invalid commit ID/)
})

test("reads a pinned historical revision, not current working-copy changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-diff-"))
  try {
    const jj = async (args: string[]) => (await execute("jj", args, { cwd: directory })).stdout
    await jj(["git", "init", "."])
    await jj(["config", "set", "--repo", "user.name", "Jello Test"])
    await jj(["config", "set", "--repo", "user.email", "test@example.com"])
    await writeFile(join(directory, "example.ts"), 'const value = "before"\n')
    await commit(directory, "Initial example")
    await writeFile(join(directory, "example.ts"), 'const value = "after"\n')
    await writeFile(join(directory, "new file.txt"), "new file\n")
    await writeFile(join(directory, "image.bin"), new Uint8Array([0, 1, 2, 0, 255]))
    await commit(directory, "Update example")
    const commitID = (await jj(["log", "--no-graph", "-r", "@-", "-T", "commit_id"])).trim()
    await writeFile(join(directory, "example.ts"), "unrelated working copy change\n")
    const result = await readRevisionDiff(directory, commitID)
    assert.equal(result.revision.commitID, commitID)
    assert.equal(result.revision.description, "Update example")
    assert.ok(result.patch.includes('-const value = "before"'))
    assert.ok(result.patch.includes('+const value = "after"'))
    assert.ok(!result.patch.includes("unrelated working copy change"))
    const files = parsePatchFiles(result.patch, commitID, true).flatMap((patch) => patch.files)
    assert.ok(files.some((file) => file.name === "example.ts" && file.hunks.length > 0))
    assert.ok(files.some((file) => file.name === "new file.txt"))
    assert.ok(files.some((file) => file.name === "image.bin" && file.hunks.length === 0))
    const root = await readRevisionDiff(directory, "0".repeat(40))
    assert.equal(root.patch, "")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

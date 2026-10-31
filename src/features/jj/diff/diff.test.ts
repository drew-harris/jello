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
import { diffFileIndex, diffTabID, diffTabTitle, parseDiffTabID, reusableDiffTab } from "./tab"

const execute = promisify(execFile)

test("diff tab titles use Working copy or JJ Diff with a dot and change ID", () => {
  assert.equal(diffTabTitle(), "JJ Diff")
  assert.equal(diffTabTitle({ current: true, changeID8: "abcdefgh" }), "Working copy")
  assert.equal(diffTabTitle({ current: false, changeID8: "abcdefgh" }), "JJ Diff · abcdefgh")
})

test("diff tabs preserve the exact revision and directory across restores", () => {
  const target = { commitID: "a".repeat(40), directory: "/project with spaces/ü#%/checkout" }
  assert.deepEqual(parseDiffTabID(diffTabID(target)), target)
  for (const id of ["jj", "jj-diff/@/dir", `jj-diff/${target.commitID}/%zz`, `jj-diff/${target.commitID}/x/extra`]) {
    assert.equal(parseDiffTabID(id), undefined)
  }
})

test("file navigation reuses a revision tab while legacy file-targeted IDs still restore", () => {
  const target = { commitID: "b".repeat(40), directory: "/repo/space ü#%", file: 'src/a "quoted" file\nname.ts' }
  const id = diffTabID(target)
  assert.deepEqual(parseDiffTabID(id), { directory: target.directory, commitID: target.commitID })
  assert.equal(id, diffTabID({ directory: target.directory, commitID: target.commitID }))
  assert.equal(id, diffTabID({ ...target, file: "src/other.ts" }))
  assert.deepEqual(parseDiffTabID(`${id}/file/${encodeURIComponent(target.file)}`), target)
  const base = diffTabID({ directory: target.directory, commitID: target.commitID })
  for (const suffix of ["/file/", "/file/%zz", "/file/x/extra", "/unknown/x"]) {
    assert.equal(parseDiffTabID(base + suffix), undefined)
  }
})

test("normal diff identities survive commit rewrites and file navigation, but isolate divergent versions", () => {
  const target = { directory: "/repo ü#%", changeID: "k".repeat(32), commitID: "a".repeat(40) }
  const id = diffTabID(target)
  assert.deepEqual(parseDiffTabID(id), { directory: target.directory, changeID: target.changeID })
  assert.equal(diffTabID({ ...target, commitID: "b".repeat(40), file: "other.txt" }), id)
  assert.notEqual(diffTabID({ ...target, directory: "/other" }), id)
  assert.notEqual(diffTabID({ ...target, divergent: true }), id)
  assert.notEqual(diffTabID({ ...target, divergent: true }), diffTabID({ ...target, commitID: "b".repeat(40), divergent: true }))
  for (const value of ["jj-diff/change/@/dir", `jj-diff/change/${target.changeID}/x/extra`, `jj-diff/change/${target.changeID}/%zz`]) {
    assert.equal(parseDiffTabID(value), undefined)
  }
})

test("opening a change reuses matching saved legacy tabs without conflating divergent versions", () => {
  const target = { directory: "/repo", changeID: "k".repeat(32), commitID: "a".repeat(40) }
  const legacy = `jj-diff/${"b".repeat(40)}/${encodeURIComponent(target.directory)}/file/old.txt`
  const metadata = { [legacy]: { current: true, changeID8: "kkkkkkkk", fullChangeID: target.changeID, divergent: false } }
  assert.equal(reusableDiffTab([legacy], { ...target, file: "new.txt" }, metadata), legacy)
  assert.equal(reusableDiffTab([legacy], { ...target, divergent: true }, metadata), diffTabID({ ...target, divergent: true }))
  assert.equal(reusableDiffTab([legacy], { ...target, directory: "/other" }, metadata), diffTabID({ ...target, directory: "/other" }))
  const canonical = diffTabID(target)
  assert.equal(reusableDiffTab([legacy, canonical], target, metadata), canonical)
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
  await assert.rejects(readRevisionDiff("/nonexistent", "a".repeat(40), undefined, "@"), /Invalid known commit ID/)
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

test("working-copy diffs snapshot edits and follow the same change across rewritten hashes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-live-diff-"))
  try {
    const jj = async (args: string[]) => (await execute("jj", args, { cwd: directory })).stdout
    await jj(["git", "init", "."])
    await jj(["config", "set", "--repo", "user.name", "Jello Test"])
    await jj(["config", "set", "--repo", "user.email", "test@example.com"])
    await writeFile(join(directory, "example.txt"), "base\n")
    await commit(directory, "Base")
    const originalID = (await jj(["log", "--no-graph", "-r", "@", "-T", "commit_id"])).trim()
    await writeFile(join(directory, "example.txt"), "first edit\n")
    const first = await readRevisionDiff(directory, originalID)
    assert.equal(first.revision.current, true)
    assert.notEqual(first.revision.commitID, originalID)
    assert.ok(first.patch.includes("+first edit"))
    await writeFile(join(directory, "example.txt"), "second edit\n")
    // Another JJ panel may snapshot the checkout before this tab refreshes.
    await jj(["status"])
    const second = await readRevisionDiff(directory, originalID)
    assert.equal(second.revision.current, true)
    assert.notEqual(second.revision.commitID, first.revision.commitID)
    assert.ok(second.patch.includes("+second edit"))
    const unchanged = await readRevisionDiff(directory, second.revision.commitID)
    assert.equal(unchanged.patch, second.patch)
    assert.equal(unchanged.revision.commitID, second.revision.commitID)
    const conditional = await readRevisionDiff(directory, second.revision.commitID, undefined, second.revision.commitID)
    assert.equal(conditional.unchanged, true)
    assert.equal(conditional.patch, "")
    assert.equal(conditional.revision.current, true)
    await writeFile(join(directory, "example.txt"), "third edit\n")
    const changed = await readRevisionDiff(directory, second.revision.commitID, undefined, second.revision.commitID)
    assert.ok(!changed.unchanged)
    assert.ok(changed.patch.includes("+third edit"))
    const changeID = changed.revision.fullChangeID!
    const stable = await readRevisionDiff(directory, changeID)
    assert.equal(stable.patch, changed.patch)
    assert.equal(stable.revision.current, true)
    await jj(["new"])
    await writeFile(join(directory, "example.txt"), "different change\n")
    const stopped = await readRevisionDiff(directory, changed.revision.commitID)
    assert.equal(stopped.revision.current, false)
    assert.equal(stopped.revision.commitID, changed.revision.commitID)
    assert.equal(stopped.patch, changed.patch)
    assert.ok(!stopped.patch.includes("different change"))
    const stoppedConditional = await readRevisionDiff(directory, changed.revision.commitID, undefined, changed.revision.commitID)
    assert.equal(stoppedConditional.unchanged, true)
    assert.equal(stoppedConditional.revision.current, false)
    await jj(["describe", "-r", changeID, "-m", "Rewritten historical change"])
    const rewritten = await readRevisionDiff(directory, changeID, undefined, changed.revision.commitID)
    assert.equal(rewritten.revision.description, "Rewritten historical change")
    assert.equal(rewritten.revision.fullChangeID, changeID)
    assert.notEqual(rewritten.revision.commitID, changed.revision.commitID)
    assert.equal(rewritten.revision.current, false)
    assert.equal(rewritten.patch, changed.patch)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("divergent changes require an exact commit rather than guessing a version", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-divergent-diff-"))
  try {
    const jj = async (args: string[]) => (await execute("jj", args, { cwd: directory })).stdout
    await jj(["git", "init", "."])
    await jj(["config", "set", "--repo", "user.name", "Jello Test"])
    await jj(["config", "set", "--repo", "user.email", "test@example.com"])
    await writeFile(join(directory, "example.txt"), "content\n")
    const sourceID = (await jj(["log", "--no-graph", "-r", "@", "-T", "commit_id"])).trim()
    const changeID = (await jj(["log", "--no-graph", "-r", "@", "-T", "change_id"])).trim()
    const operation = (await jj(["op", "log", "--no-graph", "--limit", "1", "-T", "id"])).trim()
    await jj(["describe", "-m", "First version"])
    const firstID = (await jj(["log", "--no-graph", "-r", "@", "-T", "commit_id"])).trim()
    await jj(["--at-op", operation, "describe", "-r", sourceID, "-m", "Second version"])
    await jj(["status"])
    await assert.rejects(readRevisionDiff(directory, changeID), /divergent/)
    const pinned = await readRevisionDiff(directory, firstID)
    assert.equal(pinned.revision.commitID, firstID)
    assert.equal(pinned.revision.description, "First version")
    assert.equal(pinned.revision.divergent, true)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

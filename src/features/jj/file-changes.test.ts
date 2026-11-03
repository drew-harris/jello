import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { createHash } from "node:crypto"
import { readFileChanges } from "./file-changes"
import { mergeMarkers, patchMarkers } from "../intelligence/file-changes"

const execute = promisify(execFile)
test("file gutters compare current change and main fork, with pinned content and nested cwd", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-gutters-"))
  const jj = (args: string[]) => execute("jj", ["--config", 'user.name="Test"', "--config", 'user.email="test@example.com"', ...args], { cwd: directory })
  try {
    await jj(["git", "init"])
    await mkdir(join(directory, "nested"))
    const path = join(directory, "nested", "a [x].ts")
    await writeFile(path, "one\ntwo\nthree\nfour\nfive\n")
    await jj(["bookmark", "create", "main"])
    await jj(["new"])
    await writeFile(path, "branch\ntwo\nthree\nfour\nfive\n")
    await jj(["new"])
    const text = "branch\ntwo\nthree\nfour\ncurrent\n"
    await writeFile(path, text)
    const working = (await jj(["log", "--no-graph", "-r", "@", "-T", "commit_id"])).stdout.trim()
    await jj(["new", "main"])
    await writeFile(path, "one\ntwo\nmain-only\nfour\nfive\n")
    await jj(["bookmark", "set", "main", "-r", "@"])
    await jj(["edit", working])
    const data = await readFileChanges(join(directory, "nested"), path)
    assert.equal(data.note, "")
    assert.equal(data.hash, createHash("sha256").update(text).digest("hex"))
    assert.deepEqual(mergeMarkers(patchMarkers(data.branch, "branch", 5), patchMarkers(data.current, "current", 5)), [
      { line: 0, kind: "modified", layer: "branch" }, { line: 4, kind: "modified", layer: "current" },
    ])
    const outside = await readFileChanges(directory, join(directory, ".."))
    assert.equal(outside.hash, "")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("renamed files use only the destination's patch and hash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-gutters-rename-"))
  const jj = (args: string[]) => execute("jj", args, { cwd: directory })
  try {
    await jj(["git", "init"])
    await writeFile(join(directory, "old.ts"), "one\ntwo\nthree\n")
    await jj(["bookmark", "create", "master"])
    await jj(["new"])
    await rename(join(directory, "old.ts"), join(directory, "new.ts"))
    await writeFile(join(directory, "new.ts"), "one\nchanged\nthree\n")
    const data = await readFileChanges(directory, join(directory, "new.ts"))
    const markers = patchMarkers(data.current, "current", 3)
    assert.ok(markers.length > 0)
    assert.ok(markers.every((marker) => marker.line >= 0 && marker.line < 3))
    assert.equal(data.hash, createHash("sha256").update("one\nchanged\nthree\n").digest("hex"))
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("no main/master does not silently use the current revision or root as baseline", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-gutters-no-main-"))
  try {
    await execute("jj", ["git", "init"], { cwd: directory })
    const path = join(directory, "a.ts")
    await writeFile(path, "new\n")
    const data = await readFileChanges(directory, path)
    assert.match(data.note, /No unique/)
    assert.equal(data.branch, "")
    assert.equal(patchMarkers(data.current, "current", 1)[0]!.kind, "added")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

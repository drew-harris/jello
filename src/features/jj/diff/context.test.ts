import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { hydratePartialDiff, parsePatchFiles } from "@pierre/diffs"
import { createDiffContextLoader } from "./context"
import { readDiffContext, readRevisionDiff } from "./server"

const execute = promisify(execFile)
const patch = "diff --git a/example.ts b/example.ts\n--- a/example.ts\n+++ b/example.ts\n@@ -1,3 +1,3 @@\n before\n-old\n+new\n after\n\\ No newline at end of file\n"
const file = () => parsePatchFiles(patch).flatMap((patch) => patch.files)[0]!

test("context loads are shared and preserve both sides including missing final newlines", async () => {
  let requests = 0
  const load = createDiffContextLoader(async () => { requests++; return { patch } })
  const target = file()
  const first = load(target)
  assert.equal(load(target), first)
  const contents = await first
  assert.equal(contents.oldFile?.contents, "before\nold\nafter")
  assert.equal(contents.newFile.contents, "before\nnew\nafter")
  assert.equal(await load(target), contents)
  assert.equal(requests, 1)
  await load(file())
  assert.equal(requests, 2)
})

test("failed context loads can be retried", async () => {
  let requests = 0
  const load = createDiffContextLoader(async () => {
    if (++requests === 1) throw new Error("offline")
    return { patch }
  })
  const target = file()
  await assert.rejects(load(target), /offline/)
  assert.equal((await load(target)).newFile.contents, "before\nnew\nafter")
})

test("reports parsing failures as well as request failures", async () => {
  const errors: unknown[] = []
  const load = createDiffContextLoader(async () => ({ patch: "" }), (error) => errors.push(error))
  await assert.rejects(load(file()), /No text context returned for example.ts/)
  assert.equal(errors.length, 1)
  const failed = createDiffContextLoader(async () => { throw new Error("offline") }, (error) => errors.push(error))
  await assert.rejects(failed(file()), /offline/)
  assert.equal(errors.length, 2)
})

test("context requests reject arbitrary revisions and paths", async () => {
  await assert.rejects(readDiffContext("/nonexistent", "@", "x"), /Invalid commit ID/)
  for (const path of ["", "/absolute", "../escape", "a/../escape", "bad\0path"]) {
    await assert.rejects(readDiffContext("/nonexistent", "a".repeat(40), path), /Invalid file path/)
  }
})

test("loads full context for only the requested historical file and hydrates Pierre's original hunks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-context-"))
  try {
    const jj = async (args: string[]) => (await execute("jj", args, { cwd: directory })).stdout
    await jj(["git", "init", "."])
    await jj(["config", "set", "--repo", "user.name", "Jello Test"])
    await jj(["config", "set", "--repo", "user.email", "test@example.com"])
    const path = 'space [glob] "quoted".ts'
    const before = Array.from({ length: 100 }, (_, index) => `line ${index}`).join("\n")
    const after = before.replace("line 50\n", "changed\n")
    await writeFile(join(directory, path), before)
    await writeFile(join(directory, "other.ts"), "old\n")
    await jj(["new", "-m", "Update"])
    await writeFile(join(directory, path), after)
    await writeFile(join(directory, "other.ts"), "new\n")
    const initial = await readRevisionDiff(directory, (await jj(["log", "--no-graph", "-r", "@", "-T", "commit_id"])).trim())
    const partial = parsePatchFiles(initial.patch).flatMap((patch) => patch.files).find((file) => file.name === path)!
    assert.ok(partial.isPartial)
    assert.ok(partial.additionLines.length < 100)
    await writeFile(join(directory, path), "unrelated working copy edits\n")
    const response = await readDiffContext(directory, initial.revision.commitID, path)
    assert.equal(parsePatchFiles(response.patch).flatMap((patch) => patch.files).length, 1)
    const load = createDiffContextLoader(async () => response)
    const contents = await load(partial)
    assert.equal(contents.oldFile?.contents, before)
    assert.equal(contents.newFile.contents, after)
    const full = hydratePartialDiff("clone", partial, contents)
    assert.equal(full.isPartial, false)
    assert.equal(full.additionLines.length, 100)
    assert.ok(full.hunks[0]!.collapsedBefore > 0)
    assert.equal(full.additionLines[99], "line 99")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

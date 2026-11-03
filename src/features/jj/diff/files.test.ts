import { strict as assert } from "node:assert"
import { test } from "node:test"
import { hydratePartialDiff, parsePatchFiles } from "@pierre/diffs"
import { createStore, unwrap } from "solid-js/store"
import { rendererDiffFiles, reuseDiffFiles } from "./files"

const patch = (name: string, value: string, hash: string) => `diff --git a/${name} b/${name}
index 1111111..${hash} 100644
--- a/${name}
+++ b/${name}
@@ -1 +1 @@
-before
+${value}
`
const parse = (patch: string, key: string) => parsePatchFiles(patch, key, true).flatMap((patch) => patch.files)

test("renderer metadata stays writable after passing through the createLatest store", () => {
  const files = parse(patch("a.txt", "after", "aaaaaaa"), "store")
  const [state] = createStore({ latest: { files } })
  const rendered = rendererDiffFiles(state.latest.files)
  assert.equal(rendered, files)
  assert.equal(rendered[0], files[0])
  const contents = {
    oldFile: { name: "a.txt", contents: "before\n" },
    newFile: { name: "a.txt", contents: "after\n" },
  }
  // This is the in-place commit performed by CodeView after async hydration.
  const hydrated = hydratePartialDiff("clone", rendered[0]!, contents)
  Object.assign(rendered[0]!, hydrated)
  assert.equal(rendered[0]!.isPartial, false)
  assert.equal(unwrap(state.latest.files)[0]!.isPartial, false)
  assert.equal(rendererDiffFiles(state.latest.files), rendered)
})

test("polling reuses raw hydrated models rather than read-only store proxies", () => {
  const files = parse(patch("a.txt", "after", "aaaaaaa"), "old")
  const [state] = createStore({ files })
  const next = parse(patch("a.txt", "after", "aaaaaaa"), "new")
  assert.equal(reuseDiffFiles(state.files, next)[0], files[0])
})

test("changed patches preserve unchanged file models, including after insertion/reordering", () => {
  const previous = parse(patch("a.txt", "a", "aaaaaaa") + patch("b.txt", "b", "bbbbbbb"), "old")
  const next = parse(patch("new.txt", "new", "ccccccc") + patch("b.txt", "b", "bbbbbbb") + patch("a.txt", "edited", "ddddddd"), "new")
  const reused = reuseDiffFiles(previous, next)
  assert.equal(reused[0], next[0])
  assert.equal(reused[1], previous[1])
  assert.equal(reused[2], next[2])
})

test("mode/rename changes and missing content IDs do not reuse stale file models", () => {
  const previous = parse(patch("a.txt", "a", "aaaaaaa"), "old")
  for (const changes of [{ mode: "100755" }, { prevName: "old.txt" }, { newObjectId: undefined }, { prevObjectId: "9999999" }]) {
    const file = { ...previous[0], ...changes }
    assert.equal(reuseDiffFiles(previous, [file])[0], file)
  }
})

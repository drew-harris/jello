import { strict as assert } from "node:assert"
import { test } from "node:test"
import { parsePatchFiles } from "@pierre/diffs"
import { reuseDiffFiles } from "./files"

const patch = (name: string, value: string, hash: string) => `diff --git a/${name} b/${name}
index 1111111..${hash} 100644
--- a/${name}
+++ b/${name}
@@ -1 +1 @@
-before
+${value}
`
const parse = (patch: string, key: string) => parsePatchFiles(patch, key, true).flatMap((patch) => patch.files)

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

import { strict as assert } from "node:assert"
import { test } from "node:test"
import { parsePatchFiles } from "@pierre/diffs"
import { createDiffStack, stackFileIndex } from "./stack"

const patch = (name: string, after: string) => `diff --git a/${name} b/${name}
--- a/${name}
+++ b/${name}
@@ -1 +1 @@
-before
+${after}
`
const parse = (value: string) => parsePatchFiles(value, "test", true).flatMap((patch) => patch.files)

test("stacked diffs keep stable IDs and versions when files are unchanged or reordered", () => {
  const stack = createDiffStack()
  const [a, b] = parse(patch("a.txt", "a") + patch("b.txt", "b"))
  const initial = stack([a, b])
  const reordered = stack([b, a])
  assert.equal(initial[0].type, "diff")
  assert.equal(initial[0].id, "a.txt")
  assert.equal(reordered[1].version, initial[0].version)
  assert.equal(reordered[0].version, initial[1].version)
  const changed = parse(patch("a.txt", "updated"))[0]
  const updated = stack([changed, b])
  assert.equal(updated[0].id, initial[0].id)
  assert.notEqual(updated[0].version, initial[0].version)
  assert.equal(updated[1].version, initial[1].version)
})

test("stack scrolling identifies the active file using offsets, including empty stacks", () => {
  const offsets = [0, 100, 500, 900]
  const top = (index: number) => offsets[index]
  assert.equal(stackFileIndex(0, top, 0), -1)
  assert.equal(stackFileIndex(4, top, 0), 0)
  assert.equal(stackFileIndex(4, top, 150), 1)
  assert.equal(stackFileIndex(4, top, 500), 2)
  assert.equal(stackFileIndex(4, top, 2000), 3)
})

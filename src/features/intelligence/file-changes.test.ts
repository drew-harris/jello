import { strict as assert } from "node:assert"
import { test } from "node:test"
import { mergeMarkers, patchMarkers } from "./file-changes"

test("zero-context markers distinguish replacement, insertion and deletion anchors", () => {
  assert.deepEqual(patchMarkers("@@ -2 +2,2 @@\n-old\n+new\n+extra\n@@ -5,2 +6,0 @@\n-a\n-b\n@@ -0,0 +1 @@\n+first\n", "current", 10), [
    { line: 1, kind: "modified", layer: "current" },
    { line: 2, kind: "added", layer: "current" },
    { line: 5, kind: "deleted", layer: "current" },
    { line: 0, kind: "added", layer: "current" },
  ])
  assert.equal(patchMarkers("@@ -1 +0,0 @@", "branch", 1)[0]!.line, 0)
  assert.equal(patchMarkers("@@ -9 +8,0 @@", "branch", 3)[0]!.line, 2)
  assert.deepEqual(patchMarkers("Binary files differ", "branch", 3), [])
})

test("current change markers win overlapping branch markers", () => {
  const branch = patchMarkers("@@ -1,2 +1,2 @@", "branch", 5)
  const current = patchMarkers("@@ -2 +2 @@", "current", 5)
  assert.deepEqual(mergeMarkers(branch, current), [branch[0], current[0]])
})

import { strict as assert } from "node:assert"
import { test } from "node:test"
import type { Hunk } from "@pierre/diffs"
import { adjacentHunk, hunkLine } from "./hunks"

test("hunk navigation follows viewport position without wrapping or reselecting rounded positions", () => {
  const targets = [0, 100, 400].map((top) => ({ top }))
  assert.equal(adjacentHunk(targets, 0, -1), undefined)
  assert.equal(adjacentHunk(targets, 400, 1), undefined)
  assert.equal(adjacentHunk(targets, 99.5, 1), targets[2])
  assert.equal(adjacentHunk(targets, 100.5, -1), targets[0])
  assert.equal(adjacentHunk(targets, 200, 1), targets[2])
  assert.equal(adjacentHunk(targets, 200, -1), targets[1])
  assert.equal(adjacentHunk([], 0, 1), undefined)
})

test("hunk targets use old-side lines for deletion-only hunks", () => {
  const hunk = { additionStart: 10, additionCount: 3, deletionStart: 20 } as Hunk
  assert.deepEqual(hunkLine(hunk), { lineNumber: 10, side: "additions" })
  assert.deepEqual(hunkLine({ ...hunk, additionCount: 0 }), { lineNumber: 20, side: "deletions" })
})

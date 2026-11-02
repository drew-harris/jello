import { strict as assert } from "node:assert"
import { test } from "node:test"
import { mergeOccurrenceBoxes, occurrenceSlice } from "./highlights"

test("occurrence ranges intersect syntax tokens without highlighting neighboring text", () => {
  const location = { path: "a.ts", line: 3, character: 8, endLine: 3, endCharacter: 13 }
  assert.deepEqual(occurrenceSlice(location, 3, 6, 10), { from: 2, to: 7 })
  assert.deepEqual(occurrenceSlice(location, 3, 10, 8), { from: 0, to: 3 })
  assert.equal(occurrenceSlice(location, 2, 8, 5), undefined)
  assert.equal(occurrenceSlice(location, 3, 0, 8), undefined)
  assert.equal(occurrenceSlice(location, 3, 13, 4), undefined)
})

test("rounded occurrence outlines join adjacent syntax fragments, but keep wrapped lines and active symbols separate", () => {
  const boxes = [
    { left: 10, top: 0, right: 20, bottom: 16, active: false },
    { left: 20, top: 0, right: 35, bottom: 16, active: false },
    { left: 35, top: 0, right: 45, bottom: 16, active: true },
    { left: 10, top: 22, right: 20, bottom: 38, active: false },
  ]
  assert.deepEqual(mergeOccurrenceBoxes(boxes), [
    { left: 10, top: 0, right: 35, bottom: 16, active: false }, boxes[2], boxes[3],
  ])
  assert.equal(boxes[0].right, 20, "Do not mutate original range measurements")
})

test("multiline ranges clip to each line, retaining UTF-16 character coordinates", () => {
  const location = { path: "a.ts", line: 0, character: 3, endLine: 2, endCharacter: 4 }
  assert.deepEqual(occurrenceSlice(location, 0, 0, 8), { from: 3, to: 8 })
  assert.deepEqual(occurrenceSlice(location, 1, 0, 6), { from: 0, to: 6 })
  assert.deepEqual(occurrenceSlice(location, 2, 2, 8), { from: 0, to: 2 })
})

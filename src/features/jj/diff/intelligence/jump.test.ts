import { strict as assert } from "node:assert"
import { test } from "node:test"
import type { FileDiffMetadata } from "@pierre/diffs"
import { hasDefinitionLine, localDefinition } from "./jump"

test("only an unambiguous same-file definition jumps instead of opening a peek", () => {
  const location = { path: "/repo/a.ts", line: 1, character: 6, endLine: 1, endCharacter: 11 }
  const result = { locations: [location], truncated: false, sameFile: true }
  assert.equal(localDefinition("definition", result), location)
  assert.equal(localDefinition("references", result), undefined)
  assert.equal(localDefinition("definition", { ...result, sameFile: false }), undefined)
  assert.equal(localDefinition("definition", { ...result, locations: [] }), undefined)
  assert.equal(localDefinition("definition", { ...result, locations: [location, location] }), undefined)
})

test("definition jumps require the target's new-side line to be in a loaded hunk", () => {
  const file = { hunks: [{ additionStart: 10, additionCount: 3 }, { additionStart: 25, additionCount: 0 }] } as FileDiffMetadata
  assert.equal(hasDefinitionLine(file, 9), true)
  assert.equal(hasDefinitionLine(file, 11), true)
  assert.equal(hasDefinitionLine(file, 8), false)
  assert.equal(hasDefinitionLine(file, 12), false)
  assert.equal(hasDefinitionLine(file, 24), false)
})

import { strict as assert } from "node:assert"
import { test } from "node:test"
import { identifierAt, isSelectedOccurrence } from "./position"

test("symbol positions use UTF-16 offsets and resolve distinct identifiers inside syntax tokens", () => {
  assert.deepEqual(identifierAt("foo.bar()", 5), { text: "bar", start: 4 })
  assert.equal(identifierAt("foo.bar()", 3), undefined)
  assert.deepEqual(identifierAt("😀 café $value", 5), { text: "café", start: 3 })
  assert.deepEqual(identifierAt("😀 café $value", 10), { text: "$value", start: 8 })
  assert.equal(identifierAt("  ", 0), undefined)
})

test("clicking any selected occurrence toggles off, without deselecting a shadowed variable", () => {
  const selected = { path: "a.ts", line: 0, character: 6, text: "value", expectedLine: "const value = 1" }
  const occurrences = [{ path: "/repo/a.ts", line: 2, character: 12, endLine: 2, endCharacter: 17 }]
  assert.equal(isSelectedOccurrence(selected, [], selected), true, "Toggle the initial selection before LSP responds")
  assert.equal(isSelectedOccurrence(selected, occurrences, { ...selected, line: 2, character: 12 }), true)
  assert.equal(isSelectedOccurrence(selected, occurrences, { ...selected, line: 3, character: 12 }), false, "A shadowed variable is a new selection")
  assert.equal(isSelectedOccurrence(selected, occurrences, { ...selected, path: "b.ts" }), false)
  assert.equal(isSelectedOccurrence(selected, occurrences, { ...selected, text: "other" }), false)
  assert.equal(isSelectedOccurrence(undefined, occurrences, selected), false)
})

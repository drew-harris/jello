import { strict as assert } from "node:assert"
import { test } from "node:test"
import { diffScrollAmount } from "./shortcuts"

const key = (key: string, options = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, ...options })

test("diff Vim keys scroll two lines or half of the current viewport", () => {
  assert.equal(diffScrollAmount(key("j"), 600), 46)
  assert.equal(diffScrollAmount(key("k"), 600), -46)
  assert.equal(diffScrollAmount(key("d", { ctrlKey: true }), 600), 300)
  assert.equal(diffScrollAmount(key("u", { ctrlKey: true }), 800), -400)
})

test("diff scrolling ignores other shortcuts, shifted keys, and composition", () => {
  for (const input of ["d", "u", "x", "Enter"]) assert.equal(diffScrollAmount(key(input), 600), undefined)
  assert.equal(diffScrollAmount(key("j", { ctrlKey: true }), 600), undefined)
  for (const modifier of ["metaKey", "altKey", "shiftKey", "isComposing"]) {
    assert.equal(diffScrollAmount(key("j", { [modifier]: true }), 600), undefined)
    assert.equal(diffScrollAmount(key("d", { ctrlKey: true, [modifier]: true }), 600), undefined)
  }
})

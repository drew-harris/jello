import { strict as assert } from "node:assert"
import { test } from "node:test"
import { diffHunkShortcut, diffScrollAmount, diffToggleShortcut } from "./shortcuts"

const key = (key: string, options = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, repeat: false, ...options })

test("brackets jump hunks and shifted brackets scroll smoothly", () => {
  assert.deepEqual(diffHunkShortcut(key("[")), { direction: -1, smooth: false })
  assert.deepEqual(diffHunkShortcut(key("]")), { direction: 1, smooth: false })
  for (const input of ["[", "{"]) assert.deepEqual(diffHunkShortcut(key(input, { shiftKey: true })), { direction: -1, smooth: true })
  for (const input of ["]", "}"]) assert.deepEqual(diffHunkShortcut(key(input, { shiftKey: true })), { direction: 1, smooth: true })
  for (const input of ["[", "]", "{", "}"]) {
    for (const modifier of ["ctrlKey", "metaKey", "altKey", "isComposing", "repeat"]) {
      assert.equal(diffHunkShortcut(key(input, { [modifier]: true })), undefined)
    }
  }
  assert.equal(diffHunkShortcut(key("j")), undefined)
})

test("diff toggle shortcuts map file browser, layout, and multi-file mode", () => {
  assert.equal(diffToggleShortcut(key("f")), "sidebar")
  assert.equal(diffToggleShortcut(key("t")), "layout")
  assert.equal(diffToggleShortcut(key("c")), "multiFile")
  for (const input of ["j", "k", "x", "Enter", "F", "T", "C"]) assert.equal(diffToggleShortcut(key(input)), undefined)
})

test("diff toggles ignore modifiers, composition, and held keys", () => {
  for (const input of ["f", "t", "c"]) {
    for (const modifier of ["ctrlKey", "metaKey", "altKey", "shiftKey", "isComposing", "repeat"]) {
      assert.equal(diffToggleShortcut(key(input, { [modifier]: true })), undefined)
    }
  }
})

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

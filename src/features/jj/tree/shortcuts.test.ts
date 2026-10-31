import { strict as assert } from "node:assert"
import { test } from "node:test"
import { treeShortcut } from "./shortcuts"

const key = (key: string, options = {}) => ({ key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, repeat: false, ...options })

test("tree shortcuts map the requested keys and require Shift for bookmarks", () => {
  for (const [input, action] of [["j", "down"], ["k", "up"], ["n", "new"], ["l", "expand"], ["a", "abandon"], ["d", "diff"], ["Enter", "describe"]]) {
    assert.equal(treeShortcut(key(input)), action)
  }
  assert.equal(treeShortcut(key("B", { shiftKey: true })), "bookmark")
  assert.equal(treeShortcut(key("S", { shiftKey: true })), "squash")
  assert.equal(treeShortcut(key("s")), undefined)
  for (const input of ["b", "B", "x"]) assert.equal(treeShortcut(key(input)), undefined)
  assert.equal(treeShortcut(key("J", { shiftKey: true })), undefined)
})

test("tree shortcuts ignore modifiers, composition, and repeated actions but allow repeated navigation", () => {
  for (const modifier of ["metaKey", "ctrlKey", "altKey", "isComposing"]) {
    assert.equal(treeShortcut(key("a", { [modifier]: true })), undefined)
  }
  for (const input of ["n", "l", "a", "d", "Enter"]) assert.equal(treeShortcut(key(input, { repeat: true })), undefined)
  assert.equal(treeShortcut(key("B", { shiftKey: true, repeat: true })), undefined)
  assert.equal(treeShortcut(key("S", { shiftKey: true, repeat: true })), undefined)
  assert.equal(treeShortcut(key("j", { repeat: true })), "down")
  assert.equal(treeShortcut(key("k", { repeat: true })), "up")
})

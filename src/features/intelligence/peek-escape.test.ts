import { strict as assert } from "node:assert"
import { test } from "node:test"
import { createPeekEscape } from "./peek-escape"

function key(repeat = false) {
  return Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape", repeat, isComposing: false }) as KeyboardEvent
}

test("modal Escape consumes one navigation level and ignores the following native cancel", () => {
  let depth = 2
  let closed = 0
  const handler = createPeekEscape({ escape: () => depth > 0 ? (depth--, true) : false, close: () => closed++, inMenu: () => false })
  const event = key()
  handler.keydown(event)
  assert.equal(event.defaultPrevented, true)
  handler.cancel(new Event("cancel", { cancelable: true }))
  assert.equal(depth, 1)
  assert.equal(closed, 0)
  handler.keyup(event)
  handler.keydown(key())
  assert.equal(depth, 0)
  assert.equal(closed, 0)
  handler.keyup(event)
  handler.keydown(key())
  assert.equal(closed, 1)
})

test("native cancellation without a delegated source key event also unwinds history", () => {
  let depth = 1
  let closed = 0
  const handler = createPeekEscape({ escape: () => depth > 0 ? (depth--, true) : false, close: () => closed++, inMenu: () => false })
  const event = new Event("cancel", { cancelable: true })
  handler.cancel(event)
  assert.equal(event.defaultPrevented, true)
  assert.equal(depth, 0)
  assert.equal(closed, 0)
  handler.cancel(new Event("cancel", { cancelable: true }))
  assert.equal(closed, 1)
})

test("a source-menu Escape is handled by the menu, not by modal navigation or native close", () => {
  let navigated = 0
  let closed = 0
  const handler = createPeekEscape({ escape: () => { navigated++; return true }, close: () => closed++, inMenu: () => true })
  const event = key()
  handler.keydown(event)
  assert.equal(event.defaultPrevented, false)
  event.preventDefault() // Menu controller closes its menu during bubbling.
  handler.cancel(new Event("cancel", { cancelable: true }))
  assert.equal(navigated, 0)
  assert.equal(closed, 0)
})

test("holding Escape repeats back through history but needs a fresh press to close at root", () => {
  let depth = 3
  let closed = 0
  const handler = createPeekEscape({ escape: () => depth > 0 ? (depth--, true) : false, close: () => closed++, inMenu: () => false })
  handler.keydown(key())
  assert.equal(depth, 2)
  for (let index = 0; index < 5; index++) {
    const event = key(true)
    handler.keydown(event)
    handler.cancel(new Event("cancel", { cancelable: true }))
    assert.equal(event.defaultPrevented, true)
    assert.equal(depth, Math.max(0, 1 - index), "each repeat goes back only once")
    assert.equal(closed, 0)
  }
  handler.keyup(key())
  handler.keydown(key())
  handler.cancel(new Event("cancel", { cancelable: true }))
  assert.equal(closed, 1)
})

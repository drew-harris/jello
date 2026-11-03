import { strict as assert } from "node:assert"
import { test } from "node:test"
import { createRoot } from "solid-js"
import { isServer } from "solid-js/web"
import { createContextMenu, menuItemIndex } from "./context-menu"

test("menu keyboard indices wrap, support endpoints and handle empty menus", () => {
  assert.equal(menuItemIndex("ArrowDown", 2, 3), 0)
  assert.equal(menuItemIndex("ArrowUp", 0, 3), 2)
  assert.equal(menuItemIndex("Home", 2, 3), 0)
  assert.equal(menuItemIndex("End", 0, 3), 2)
  assert.equal(menuItemIndex("ArrowDown", -1, 3), 0)
  assert.equal(menuItemIndex("ArrowDown", -1, 0), undefined)
  assert.equal(menuItemIndex("F12", 0, 3), undefined)
})

test("menus clamp placement, focus enabled items, respect shadow paths and remove listeners", { skip: isServer }, () => {
  const window = Object.assign(new EventTarget(), { innerWidth: 500, innerHeight: 400 })
  const document = Object.assign(new EventTarget(), { activeElement: undefined as unknown })
  let focused = -1
  const buttons = [0, 1].map((index) => ({ focus() { focused = index; document.activeElement = buttons[index] } }))
  const menu = { style: { left: "", top: "" }, getBoundingClientRect: () => ({ width: 200, height: 100 }),
    querySelector: () => buttons[0], querySelectorAll: () => buttons, focus() { focused = 99 } }
  const closes: boolean[] = []
  let dispose!: () => void
  const keydown = createRoot((cleanup) => {
    dispose = cleanup
    return createContextMenu(() => menu as unknown as HTMLDivElement, { x: 490, y: 390, close: (restore = false) => { closes.push(restore) } },
      { window, document } as unknown as { window: Window & typeof globalThis; document: Document })
  })
  try {
    assert.deepEqual(menu.style, { left: "292px", top: "292px" })
    assert.equal(focused, 0)
    const key = (value: string) => keydown({ key: value, preventDefault() {}, stopPropagation() {} } as KeyboardEvent)
    key("ArrowDown")
    assert.equal(focused, 1)
    key("Home")
    assert.equal(focused, 0)
    key("Escape")
    key("Tab")
    assert.deepEqual(closes, [true, true])
    const inside = new Event("pointerdown")
    Object.defineProperty(inside, "composedPath", { value: () => [buttons[0], menu] })
    document.dispatchEvent(inside)
    assert.equal(closes.length, 2)
    document.dispatchEvent(new Event("pointerdown"))
    window.dispatchEvent(new Event("blur"))
    assert.deepEqual(closes, [true, true, false, false])
    dispose()
    document.dispatchEvent(new Event("pointerdown"))
    window.dispatchEvent(new Event("resize"))
    assert.equal(closes.length, 4)
  } finally { dispose() }
})

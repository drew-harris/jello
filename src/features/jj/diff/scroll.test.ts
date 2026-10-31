import { strict as assert } from "node:assert"
import { test } from "node:test"
import { createDiffScroller } from "./scroll"

function setup(reducedMotion = false) {
  let now = 0
  let next = 0
  const frames = new Map<number, (time: number) => void>()
  const viewport = {
    scrollTop: 2000, scrollHeight: 10_000, clientHeight: 600, isConnected: true,
    scrollTo({ top }: { top: number }) { this.scrollTop = top },
  }
  const scroller = createDiffScroller({
    now: () => now,
    frame: (callback) => { frames.set(++next, callback); return next },
    cancel: (id) => { frames.delete(id) },
    reducedMotion: () => reducedMotion,
  })
  const step = () => {
    now += 16
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(now)
  }
  const advance = (count: number) => { for (let i = 0; i < count; i++) step() }
  return { viewport, scroller, frames, step, advance }
}

test("tapping Ctrl+D/U smoothly moves exactly half a viewport", () => {
  const { viewport, scroller, advance, frames } = setup()
  scroller.start("ctrl+d", 300, viewport)
  scroller.release("d")
  advance(1)
  assert.ok(viewport.scrollTop > 2000 && viewport.scrollTop < 2300)
  advance(50)
  assert.equal(viewport.scrollTop, 2300)
  assert.equal(frames.size, 0)
  scroller.start("ctrl+u", -300, viewport)
  scroller.release("Control")
  advance(51)
  assert.equal(viewport.scrollTop, 2000)
})

test("holding scrolls continuously without OS repeat, and repeat events never restart it", () => {
  const held = setup()
  const repeated = setup()
  held.scroller.start("ctrl+d", 300, held.viewport)
  repeated.scroller.start("ctrl+d", 300, repeated.viewport)
  for (let i = 0; i < 90; i++) {
    const before = held.viewport.scrollTop
    held.step()
    repeated.scroller.start("ctrl+d", 300, repeated.viewport)
    repeated.step()
    assert.ok(held.viewport.scrollTop > before)
    assert.equal(repeated.viewport.scrollTop, held.viewport.scrollTop)
  }
  assert.ok(held.viewport.scrollTop > 3000)
  held.scroller.release("d")
  const releasedAt = held.viewport.scrollTop
  held.advance(60)
  assert.ok(held.viewport.scrollTop - releasedAt < 150)
  assert.equal(held.frames.size, 0)
})

test("scrolling clamps at boundaries, reverses, and cancels immediately on interaction/unmount", () => {
  const { viewport, scroller, advance, frames } = setup()
  viewport.scrollTop = 5
  scroller.start("ctrl+u", -300, viewport)
  advance(60)
  assert.equal(viewport.scrollTop, 0)
  assert.equal(frames.size, 0)
  scroller.start("j", 46, viewport)
  advance(20)
  const before = viewport.scrollTop
  scroller.start("k", -46, viewport)
  advance(1)
  assert.ok(viewport.scrollTop < before)
  scroller.stop()
  const stopped = viewport.scrollTop
  advance(30)
  assert.equal(viewport.scrollTop, stopped)
  scroller.start("j", 46, viewport)
  viewport.isConnected = false
  advance(1)
  assert.equal(frames.size, 0)
})

test("reduced motion jumps tapped steps without easing", () => {
  const { viewport, scroller, step } = setup(true)
  scroller.start("ctrl+d", 300, viewport)
  scroller.release("d")
  step()
  assert.equal(viewport.scrollTop, 2300)
})

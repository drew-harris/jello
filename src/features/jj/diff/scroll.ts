interface ScrollViewport {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  isConnected: boolean
  scrollTo(options: { top: number; behavior: "instant" }): void
}

interface ScrollClock {
  now(): number
  frame(callback: (time: number) => void): number
  cancel(frame: number): void
  reducedMotion(): boolean
}

// One animation owns the destination. Key repeat must not restart a native
// smooth-scroll animation or enqueue an ever-growing series of half pages.
export function createDiffScroller(clock: ScrollClock) {
  let frame: number | undefined
  let active: { key: string; viewport: ScrollViewport; target: number; held: boolean; started: number; last: number; speed: number } | undefined
  const clamp = (viewport: ScrollViewport, top: number) => Math.max(0, Math.min(top, Math.max(0, viewport.scrollHeight - viewport.clientHeight)))
  const stop = () => {
    if (frame !== undefined) clock.cancel(frame)
    frame = undefined
    active = undefined
  }
  const tick = (time: number) => {
    frame = undefined
    const state = active
    if (!state || !state.viewport.isConnected) { stop(); return }
    const elapsed = Math.max(0, Math.min(64, time - state.last))
    state.last = time
    // A tap is exactly one step. Holding extends the same destination at a
    // steady rate, without waiting for the operating system's repeat delay.
    const heldTime = Math.max(0, Math.min(elapsed, time - state.started - 160))
    if (state.held) state.target += state.speed * heldTime / 1000
    state.target = clamp(state.viewport, state.target)
    const current = state.viewport.scrollTop
    const distance = state.target - current
    const next = clock.reducedMotion() || Math.abs(distance) < .5 ? state.target
      : current + distance * (1 - Math.exp(-elapsed / 65))
    state.viewport.scrollTo({ top: next, behavior: "instant" })
    const atEnd = state.target === 0 || state.target === Math.max(0, state.viewport.scrollHeight - state.viewport.clientHeight)
    if (Math.abs(state.target - state.viewport.scrollTop) < .5 && (!state.held || atEnd)) {
      state.viewport.scrollTo({ top: state.target, behavior: "instant" })
      stop()
      return
    }
    frame = clock.frame(tick)
  }
  return {
    start(key: string, amount: number, viewport: ScrollViewport) {
      if (active?.key === key && active.viewport === viewport && active.held) return
      const now = clock.now()
      const base = active?.key === key && active.viewport === viewport ? active.target : viewport.scrollTop
      const speed = Math.sign(amount) * (key.startsWith("ctrl+") ? viewport.clientHeight * 1.5 : 460)
      active = { key, viewport, target: clamp(viewport, base + amount), held: true, started: now, last: now, speed }
      if (frame === undefined) frame = clock.frame(tick)
    },
    release(key: string) {
      if (key.length === 1) key = key.toLowerCase()
      if (active && (active.key === key || active.key.endsWith(`+${key}`) || (key === "Control" && active.key.startsWith("ctrl+")))) {
        active.held = false
      }
    },
    stop,
  }
}

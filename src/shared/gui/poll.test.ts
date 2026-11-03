import { strict as assert } from "node:assert"
import { test } from "node:test"
import { createRoot, createSignal } from "solid-js"
import { isServer } from "solid-js/web"
import { createPolling, shouldRefresh, type RefreshPolicy, type PollingEnvironment } from "./poll"

test("refresh policy respects visibility, backoff and pending requests even for forced refreshes", () => {
  const policy: RefreshPolicy = { loading: () => false, enabled: () => true, visible: () => true,
    lastFinished: () => 100, delay: () => 3000, refresh() {} }
  assert.equal(shouldRefresh(policy, 3099), false)
  assert.equal(shouldRefresh(policy, 3100), true)
  assert.equal(shouldRefresh({ ...policy, enabled: () => false }, 3100), false)
  assert.equal(shouldRefresh({ ...policy, enabled: () => false }, 101, true), true)
  assert.equal(shouldRefresh({ ...policy, loading: () => true }, 3100, true), false)
  assert.equal(shouldRefresh({ ...policy, visible: () => false }, 3100, true), false)
  assert.equal(shouldRefresh({ ...policy, enabled: () => false, stale: () => true }, 101), true)
})

test("polling waits for completion, coalesces focus, pauses hidden views and cleans up", { skip: isServer }, () => {
  let now = 0
  let lastFinished = 0
  let visible = true
  let calls = 0
  const timers = new Map<number, () => void>()
  const environment: PollingEnvironment = {
    now: () => now,
    focus: new EventTarget(), visibility: new EventTarget(),
    schedule(callback, delay) { const due = now + delay; timers.set(due, callback); return () => { timers.delete(due) } },
  }
  let dispose!: () => void
  let finish!: () => void
  const poll = createRoot((cleanup) => {
    dispose = cleanup
    const [loading, setLoading] = createSignal(false)
    finish = () => { lastFinished = now; setLoading(false) }
    return createPolling({ loading, enabled: () => true, visible: () => visible,
      lastFinished: () => lastFinished, delay: () => 3000,
      refresh() { calls++; setLoading(true) },
    }, environment)
  })
  try {
    assert.deepEqual([...timers.keys()], [3000])
    now = 3000
    environment.focus.dispatchEvent(new Event("focus"))
    environment.visibility.dispatchEvent(new Event("visibilitychange"))
    assert.equal(calls, 1)
    assert.equal(timers.size, 0)
    now = 20_000
    poll.refresh(true)
    assert.equal(calls, 1, "even a manual refresh cannot overlap")
    finish()
    assert.deepEqual([...timers.keys()], [23_000])
    environment.focus.dispatchEvent(new Event("focus"))
    assert.equal(calls, 1)
    visible = false
    now = 23_000
    const timer = timers.get(now)!
    timers.delete(now)
    timer()
    assert.equal(calls, 1)
    assert.deepEqual([...timers.keys()], [26_000], "hidden views must not spin zero-delay timers")
    visible = true
    environment.visibility.dispatchEvent(new Event("visibilitychange"))
    assert.equal(calls, 2)
    now = 30_000
    finish()
    dispose()
    assert.equal(timers.size, 0)
    now = 40_000
    environment.focus.dispatchEvent(new Event("focus"))
    environment.visibility.dispatchEvent(new Event("visibilitychange"))
    poll.refresh(true)
    assert.equal(calls, 2)
  } finally { dispose() }
})

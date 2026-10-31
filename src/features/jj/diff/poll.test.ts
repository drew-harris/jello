import { strict as assert } from "node:assert"
import { test } from "node:test"
import { DIFF_POLL_INTERVAL, diffPollDelay } from "./poll"

test("diff polls wait at least three seconds after completion and adapt to slow requests", () => {
  assert.equal(DIFF_POLL_INTERVAL, 3_000)
  assert.equal(diffPollDelay(100, 0), 3_000)
  assert.equal(diffPollDelay(8_000, 0), 8_000)
  assert.equal(diffPollDelay(90_000, 0), 30_000)
})

test("diff polling backs off on failures, caps delay, and recovers after success", () => {
  assert.equal(diffPollDelay(100, 1), 6_000)
  assert.equal(diffPollDelay(100, 2), 12_000)
  assert.equal(diffPollDelay(100, 10), 60_000)
  assert.equal(diffPollDelay(20_000, 3), 60_000)
  assert.equal(diffPollDelay(100, 0), 3_000)
})

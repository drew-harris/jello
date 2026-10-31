import { strict as assert } from "node:assert"
import { test } from "node:test"
import { revisionAge } from "./time"

test("formats revision ages and handles invalid or future timestamps", () => {
  const timestamp = "2026-10-31T00:00:00-07:00"
  const start = Date.parse(timestamp)
  assert.equal(revisionAge(timestamp, start + 59_000), "just now")
  assert.equal(revisionAge(timestamp, start + 120_000), "2m ago")
  assert.equal(revisionAge(timestamp, start + 7_200_000), "2h ago")
  assert.equal(revisionAge(timestamp, start + 172_800_000), "2d ago")
  assert.equal(revisionAge(timestamp, start - 1000), "just now")
  assert.equal(revisionAge("", start), "Unknown time")
})

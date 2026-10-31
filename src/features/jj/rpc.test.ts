import { strict as assert } from "node:assert"
import { test } from "node:test"
import { Status } from "./rpc"

test("JJ RPC schemas do not use regex patterns rejected by the host validator", () => {
  const check = (value: unknown): void => {
    if (!value || typeof value !== "object") return
    for (const [key, child] of Object.entries(value)) {
      assert.notEqual(key, "pattern", "Validate patterns in server helpers instead of RPC schemas")
      assert.notEqual(key, "patternProperties")
      check(child)
    }
  }
  check(Status.methods)
})

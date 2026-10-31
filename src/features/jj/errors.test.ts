import { strict as assert } from "node:assert"
import { test } from "node:test"
import { errorMessage } from "./errors"

test("shows structured RPC errors instead of [object Object]", () => {
  assert.equal(errorMessage({ _tag: "RpcError", type: "rpc.invalid_input", message: "Invalid schema" }), "Invalid schema")
  assert.equal(errorMessage(new Error("Command failed")), "Command failed")
  assert.equal(errorMessage("Disconnected"), "Disconnected")
  assert.equal(errorMessage({ unexpected: true }), '{"unexpected":true}')
})

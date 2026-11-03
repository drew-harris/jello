import { strict as assert } from "node:assert"
import { test } from "node:test"
import type { Context } from "@opencode/plugin/gui"
import { createAsyncAction, createActionGate } from "./async-action"
import { createRepositoryServices } from "./repository"

test("async actions suppress duplicate submissions and clean up progress and busy state", async () => {
  const messages: Array<{ variant: string; title: string }> = []
  let dismissed = 0
  let finished = 0
  const toast = { show: (message: { variant: string; title: string }) => {
    messages.push(message)
    return { dismiss: () => dismissed++ }
  } } as Context["toast"]
  const gate = createActionGate()
  const action = createAsyncAction({ toast, gate })
  let resolve!: (value: number) => void
  const work = action.run(() => new Promise<number>((yes) => { resolve = yes }), {
    progress: "Working", success: "Done", onSuccess: () => finished++,
  })
  assert.equal(action.pending(), true)
  assert.equal(gate.pending(), true)
  await action.run(async () => { throw new Error("must not execute") })
  resolve(42)
  assert.equal(await work, 42)
  assert.deepEqual(messages.map((message) => message.variant), ["loading", "success"])
  assert.equal(dismissed, 1)
  assert.equal(finished, 1)
  assert.equal(action.pending(), false)
  assert.equal(gate.pending(), false)
})

test("failed actions retain structured RPC errors, do not invalidate, and can retry", async () => {
  const action = createAsyncAction()
  let successes = 0
  await action.run(async () => { throw { message: "remote offline" } }, { onSuccess: () => successes++ })
  assert.equal(action.error(), "remote offline")
  assert.equal(successes, 0)
  await assert.rejects(action.run(async () => { throw new Error("dialog failure") }, { rethrow: true }), /dialog failure/)
  assert.equal(action.pending(), false)
  assert.equal(await action.run(async () => 42, { onSuccess: () => successes++ }), 42)
  assert.equal(action.error(), "")
  assert.equal(successes, 1)
})

test("repository gates protect different components but isolate different repositories", async () => {
  const repositories = createRepositoryServices()
  const repository = { server: "remote", directory: "/repo" }
  const gate = repositories.gate(repository)
  assert.equal(repositories.gate({ ...repository }), gate)
  const release = gate.acquire()
  const action = createAsyncAction({ gate })
  await assert.rejects(action.run(async () => { throw new Error("must not execute") }, { rethrow: true }), /Another change operation/)
  assert.equal(gate.pending(), true, "a rejected contender must not release the active operation")
  assert.equal(action.pending(), false)
  assert.equal(repositories.gate({ ...repository, server: "other" }).pending(), false)
  assert.equal(repositories.gate({ ...repository, directory: "/other" }).pending(), false)
  release()
  assert.equal(await action.run(async () => 42), 42)
})

test("failed work dismisses progress, releases the gate and never publishes success", async () => {
  const variants: string[] = []
  let dismissed = 0
  const gate = createActionGate()
  const action = createAsyncAction({ gate, toast: { show: (message: { variant: string }) => {
    variants.push(message.variant)
    return { dismiss: () => dismissed++ }
  } } as Context["toast"] })
  await action.run(async () => { throw new Error("offline") }, { progress: "Working", success: "Done", failure: "Failed" })
  assert.deepEqual(variants, ["loading", "error"])
  assert.equal(dismissed, 1)
  assert.equal(gate.pending(), false)
  assert.equal(action.pending(), false)
  assert.equal(action.error(), "offline")
})

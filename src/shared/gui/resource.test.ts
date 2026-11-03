import { strict as assert } from "node:assert"
import { test } from "node:test"
import { createRoot } from "solid-js"
import { isServer } from "solid-js/web"
import { createResourceModel, pollDelay } from "./resource"

const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve() }

test("generic backoff never shortens a feature's requested polling interval", () => {
  assert.equal(pollDelay(0, 0, 120_000), 120_000)
  assert.equal(pollDelay(0, 1, 3000), 6000)
})

test("resource invalidations during a request coalesce into one follow-up read", { skip: isServer }, async () => {
  const requests: Array<{ resolve(value: number): void; signal: AbortSignal }> = []
  let dispose!: () => void
  const resource = createRoot((cleanup) => {
    dispose = cleanup
    return createResourceModel<string, number>((_input, signal) => new Promise((resolve) => requests.push({ resolve, signal })))
  })
  try {
    resource.configure("repo")
    await flush()
    resource.configure("repo")
    resource.refresh()
    resource.invalidate()
    resource.invalidate()
    await flush()
    assert.equal(requests.length, 1)
    requests[0].resolve(1)
    await flush()
    assert.equal(requests.length, 2)
    assert.equal(resource.result.latest, 1)
    assert.equal(resource.result.loading, true)
    requests[1].resolve(2)
    await flush()
    assert.equal(resource.result.latest, 2)
    assert.equal(resource.result.loading, false)
    assert.equal(requests.length, 2)
  } finally { dispose() }
})

test("superseding configuration and disposal abort resource publication", { skip: isServer }, async () => {
  const requests: Array<{ resolve(value: number): void; signal: AbortSignal }> = []
  let dispose!: () => void
  const resource = createRoot((cleanup) => {
    dispose = cleanup
    return createResourceModel<string, number>((_input, signal) => new Promise((resolve) => requests.push({ resolve, signal })))
  })
  resource.configure("first")
  await flush()
  resource.configure("second")
  await flush()
  assert.equal(requests[0].signal.aborted, true)
  requests[1].resolve(2)
  await flush()
  requests[0].resolve(1)
  await flush()
  assert.equal(resource.result.latest, 2)
  resource.refresh()
  await flush()
  dispose()
  assert.equal(requests[2].signal.aborted, true)
  requests[2].resolve(3)
  await flush()
  assert.equal(resource.result.latest, 2)
})

test("hidden resources defer invalidation without losing staleness across an in-flight read", { skip: isServer }, async () => {
  let resolve!: (value: number) => void
  let calls = 0
  let dispose!: () => void
  const resource = createRoot((cleanup) => {
    dispose = cleanup
    return createResourceModel<string, number>(() => { calls++; return new Promise((yes) => { resolve = yes }) })
  })
  try {
    resource.configure("repo")
    await flush()
    resource.invalidate({ defer: true })
    resolve(1)
    await flush()
    assert.equal(calls, 1)
    assert.equal(resource.stale(), true)
    resource.refresh()
    await flush()
    assert.equal(calls, 2)
    assert.equal(resource.stale(), false)
    resolve(2)
    await flush()
    assert.equal(resource.result.latest, 2)
  } finally { dispose() }
})

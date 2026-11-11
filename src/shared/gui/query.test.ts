import { strict as assert } from "node:assert"
import { test } from "node:test"
import { QueryObserver } from "@tanstack/solid-query"
import { createWindowQueries, pollDelay, queryDelay, readQueryOptions } from "./query"

const flush = async () => { for (let index = 0; index < 30; index++) await Promise.resolve() }
const key = ["jj", "remote", "/repo", "history"]

test("query polling backs off from completion and does not overlap slow reads", async () => {
  assert.equal(pollDelay(0, 0, 120_000), 120_000)
  assert.equal(pollDelay(20_000, 1, 3000), 40_000)
  const queries = createWindowQueries()
  let calls = 0
  let resolve!: (value: number) => void
  const options = readQueryOptions(queries.client, key, () => {
    calls++
    return new Promise<number>((yes) => { resolve = yes })
  }, { interval: 3000 })
  const observer = new QueryObserver(queries.client, options)
  const unsubscribe = observer.subscribe(() => {})
  try {
    const query = observer.getCurrentQuery()
    const interval = options.refetchInterval as (value: typeof query) => number | false
    assert.equal(interval(query), false)
    void observer.refetch({ cancelRefetch: false })
    queries.client.getQueryCache().onFocus()
    assert.equal(calls, 1)
    resolve(1)
    await flush()
    assert.equal(interval(query), 3000)
    assert.ok(query.state.dataUpdatedAt > 0)
    assert.equal(observer.getCurrentResult().data, 1)
  } finally { unsubscribe(); queries.dispose() }
})

test("multiple observers share a read and cancellation only aborts the last consumer", async () => {
  const queries = createWindowQueries()
  let signal!: AbortSignal
  let resolve!: (value: number) => void
  let calls = 0
  const options = readQueryOptions(queries.client, key, (input) => {
    calls++; signal = input
    return new Promise<number>((yes) => { resolve = yes })
  })
  const first = new QueryObserver(queries.client, options)
  const second = new QueryObserver(queries.client, options)
  const one = first.subscribe(() => {})
  const two = second.subscribe(() => {})
  try {
    assert.equal(calls, 1)
    one()
    assert.equal(signal.aborted, false)
    two()
    assert.equal(signal.aborted, true)
    resolve(1)
    await flush()
    assert.equal(queries.client.getQueryData(key), undefined)
  } finally { one(); two(); queries.dispose() }
})

test("mutation bursts during a read coalesce into one follow-up without cancelling it", async () => {
  const queries = createWindowQueries()
  const requests: Array<{ signal: AbortSignal; resolve(value: number): void }> = []
  const options = readQueryOptions(queries.client, key, (signal) => new Promise<number>((resolve) => requests.push({ signal, resolve })))
  const observer = new QueryObserver(queries.client, options)
  const unsubscribe = observer.subscribe(() => {})
  try {
    queries.invalidate(key.slice(0, 3))
    queries.invalidate(key.slice(0, 3))
    await flush()
    assert.equal(requests.length, 1)
    assert.equal(requests[0].signal.aborted, false)
    requests[0].resolve(1)
    await flush()
    assert.equal(requests.length, 2)
    assert.equal(observer.getCurrentResult().data, 1)
    requests[1].resolve(2)
    await flush()
    assert.equal(requests.length, 2)
    assert.equal(observer.getCurrentResult().data, 2)
    // Background reads with cached data must not be cancelled either.
    void observer.refetch({ cancelRefetch: false })
    queries.invalidate(key.slice(0, 3))
    queries.invalidate(key.slice(0, 3))
    await flush()
    assert.equal(requests.length, 3)
    assert.equal(requests[2].signal.aborted, false)
    requests[2].resolve(3)
    await flush()
    assert.equal(requests.length, 4)
    requests[3].resolve(4)
    await flush()
    assert.equal(observer.getCurrentResult().data, 4)
  } finally { unsubscribe(); queries.dispose() }
})

test("hidden queries retain invalidation across a read and refresh when enabled", async () => {
  const queries = createWindowQueries()
  const requests: Array<(value: number) => void> = []
  const options = readQueryOptions(queries.client, key, () => new Promise<number>((resolve) => requests.push(resolve)))
  const observer = new QueryObserver(queries.client, options)
  const unsubscribe = observer.subscribe(() => {})
  try {
    observer.setOptions({ ...options, enabled: false })
    queries.invalidate(key.slice(0, 3))
    await flush()
    requests[0](1)
    await flush()
    assert.equal(requests.length, 1)
    assert.equal(observer.getCurrentQuery().state.isInvalidated, true)
    observer.setOptions({ ...options, enabled: true })
    assert.equal(requests.length, 2)
    requests[1](2)
    await flush()
    assert.equal(observer.getCurrentQuery().state.isInvalidated, false)
  } finally { unsubscribe(); queries.dispose() }
})

test("refresh errors retain data, increase backoff, and focus respects that backoff", async () => {
  const queries = createWindowQueries()
  let fail = false
  let calls = 0
  const options = readQueryOptions(queries.client, key, async () => {
    calls++
    if (fail) throw new Error("offline")
    return 42
  }, { interval: 3000 })
  const observer = new QueryObserver(queries.client, options)
  const unsubscribe = observer.subscribe(() => {})
  try {
    await flush()
    fail = true
    await observer.refetch({ cancelRefetch: false })
    assert.equal(observer.getCurrentResult().data, 42)
    assert.equal((observer.getCurrentResult().error as Error).message, "offline")
    assert.equal(queryDelay(queries.client, observer.getCurrentQuery(), 3000), 6000)
    queries.client.getQueryCache().onFocus()
    await flush()
    assert.equal(calls, 2)
    await observer.refetch({ cancelRefetch: false })
    assert.equal(queryDelay(queries.client, observer.getCurrentQuery(), 3000), 12_000)
    fail = false
    await observer.refetch({ cancelRefetch: false })
    assert.equal(queryDelay(queries.client, observer.getCurrentQuery(), 3000), 3000)
  } finally { unsubscribe(); queries.dispose() }
})

test("window disposal cancels pending work and clears cache", async () => {
  const queries = createWindowQueries()
  let signal!: AbortSignal
  let resolve!: (value: number) => void
  const pending = queries.client.fetchQuery(readQueryOptions(queries.client, key, (input) => {
    signal = input
    return new Promise<number>((yes) => { resolve = yes })
  }))
  const rejected = assert.rejects(pending)
  queries.dispose()
  assert.equal(signal.aborted, true)
  resolve(1)
  await rejected
  assert.equal(queries.client.getQueryCache().getAll().length, 0)
})

import { strict as assert } from "node:assert"
import { test } from "node:test"
import { createRoot, createSignal } from "solid-js"
import { unwrap } from "solid-js/store"
import { isServer } from "solid-js/web"
import type { MountedSession } from "@opencode/plugin/gui"
import { createWindowQueries, queryData } from "../../../shared/gui/query"
import { createHistoryQueries } from "./state"
import { historyQuery } from "../queries"
import type { TreeHistory } from "./model"

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = async () => { for (let index = 0; index < 30; index++) await Promise.resolve() }
const repository = { server: "remote", directory: "/repo" }
const presence = async () => ({ worktreeSessions: [], worktreeSessionsTruncated: false })

test("Solid queries reuse prefetched history across remounts and retain data on refresh errors", { skip: isServer }, async () => {
  const queries = createWindowQueries()
  const pending = [deferred<TreeHistory>(), deferred<TreeHistory>()]
  let calls = 0
  const client = { rpc: () => ({ tree: () => pending[calls++]!.promise, worktreeSessions: presence }) } as unknown as MountedSession["server"]["client"]
  let dispose = () => {}
  try {
    const preload = queries.client.prefetchQuery(historyQuery(queries.client, repository, client, 100))
    const first = createRoot((cleanup) => { dispose = cleanup; return createHistoryQueries(queries, repository, () => client, () => 100, () => true) })
    await flush()
    assert.equal(calls, 1)
    pending[0].resolve({ commits: [], hasMore: false })
    await preload
    await flush()
    assert.deepEqual(unwrap(queryData(first.history)), { commits: [], hasMore: false })
    dispose()
    const second = createRoot((cleanup) => { dispose = cleanup; return createHistoryQueries(queries, repository, () => client, () => 100, () => true) })
    await flush()
    assert.equal(calls, 1)
    second.refresh()
    await flush()
    assert.equal(second.history.isFetching, true)
    assert.ok(queryData(second.history))
    pending[1].reject(new Error("offline"))
    await flush()
    assert.equal(second.history.isFetching, false)
    assert.equal((second.history.error as Error).message, "offline")
    assert.deepEqual(unwrap(queryData(second.history)), { commits: [], hasMore: false })
  } finally { dispose(); queries.dispose() }
})

test("history limit changes retain the graph, abort superseded work, and cannot publish old responses", { skip: isServer }, async () => {
  const queries = createWindowQueries()
  const requests: Array<{ signal: AbortSignal; result: ReturnType<typeof deferred<TreeHistory>> }> = []
  const client = { rpc: () => ({ tree: (_input: unknown, options: { signal: AbortSignal }) => {
    const result = deferred<TreeHistory>()
    requests.push({ signal: options.signal, result })
    return result.promise
  }, worktreeSessions: presence }) } as unknown as MountedSession["server"]["client"]
  const [limit, setLimit] = createSignal(100)
  let dispose = () => {}
  const model = createRoot((cleanup) => { dispose = cleanup; return createHistoryQueries(queries, repository, () => client, limit, () => true) })
  try {
    await flush()
    requests[0].result.resolve({ commits: [], hasMore: true })
    await flush()
    setLimit(200)
    await flush()
    assert.equal(queryData(model.history)?.hasMore, true)
    setLimit(300)
    await flush()
    assert.equal(requests[1].signal.aborted, true)
    requests[2].result.resolve({ commits: [], hasMore: false })
    await flush()
    requests[1].result.resolve({ commits: [], hasMore: true })
    await flush()
    assert.equal(queryData(model.history)?.hasMore, false)
    model.refresh()
    await flush()
    dispose()
    assert.equal(requests[3].signal.aborted, true)
  } finally { dispose(); queries.dispose() }
})

test("slow worktree presence never blocks history, shares its query across limits, and uses explicit request location", { skip: isServer }, async () => {
  const queries = createWindowQueries()
  const pending = deferred<{ worktreeSessions: []; worktreeSessionsTruncated: false }>()
  let calls = 0
  let request: unknown
  const client = { rpc: () => ({ tree: async () => ({ commits: [], hasMore: false }),
    worktreeSessions: (_input: unknown, options: unknown) => { calls++; request = options; return pending.promise },
  }) } as unknown as MountedSession["server"]["client"]
  const [limit, setLimit] = createSignal(100)
  let dispose = () => {}
  const model = createRoot((cleanup) => { dispose = cleanup; return createHistoryQueries(queries, repository, () => client, limit, () => true) })
  try {
    await flush()
    assert.equal(model.history.isFetching, false)
    assert.ok(queryData(model.history))
    assert.equal(model.positions.isFetching, true)
    assert.equal(calls, 1)
    assert.deepEqual((request as { location: unknown }).location, { directory: "/repo" })
    setLimit(200)
    await flush()
    assert.equal(calls, 1)
    pending.resolve({ worktreeSessions: [], worktreeSessionsTruncated: false })
    await flush()
    assert.equal(model.positions.isFetching, false)
  } finally { dispose(); queries.dispose() }
})

import { strict as assert } from "node:assert"
import { test } from "node:test"
import { createRoot } from "solid-js"
import { unwrap } from "solid-js/store"
import { isServer } from "solid-js/web"
import type { MountedSession } from "@opencode/plugin/gui"
import { ViewModels } from "../view-models"
import { createHistoryModel, type HistoryModel } from "./state"
import type { TreeHistory } from "./model"

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = async () => { await new Promise<void>((resolve) => queueMicrotask(resolve)); await Promise.resolve() }

// Run these with `bun --conditions=browser test src/features/jj/tree/state.test.ts`.
test("createLatest finishes across remounts, deduplicates mounts, and retains data on refresh errors", { skip: isServer }, async () => {
  const pending = [deferred<TreeHistory>(), deferred<TreeHistory>()]
  let calls = 0
  const client = { rpc: () => ({ tree: () => pending[calls++]!.promise }) } as unknown as MountedSession["server"]["client"]
  let models!: ViewModels<HistoryModel>
  let dispose!: () => void
  let model!: HistoryModel
  createRoot((cleanup) => { dispose = cleanup; models = new ViewModels() })
  try {
    createRoot((unmount) => {
      model = models.use("repo", () => createHistoryModel("/repo"))
      model.configure(client, 100, 0)
      unmount()
    })
    await flush()
    assert.equal(calls, 1)
    const history = { commits: [], hasMore: false } as TreeHistory
    pending[0]!.resolve(history)
    await flush()
    createRoot((unmount) => {
      assert.equal(models.use("repo", () => { throw new Error("must reuse") }), model)
      model.configure(client, 100, 0)
      unmount()
    })
    await flush()
    assert.equal(calls, 1)
    assert.deepEqual(unwrap(model.history.latest), history)
    model.refresh()
    await flush()
    assert.equal(model.history.loading, true)
    assert.deepEqual(unwrap(model.history.latest), history)
    pending[1]!.reject(new Error("offline"))
    await flush()
    assert.equal(model.history.loading, false)
    assert.equal((model.history.error as Error).message, "offline")
    assert.deepEqual(unwrap(model.history.latest), history)
  } finally { dispose() }
})

test("createLatest ignores superseded requests and aborts publication on window disposal", { skip: isServer }, async () => {
  const pending = [deferred<TreeHistory>(), deferred<TreeHistory>(), deferred<TreeHistory>()]
  let calls = 0
  const client = { rpc: () => ({ tree: () => pending[calls++]!.promise }) } as unknown as MountedSession["server"]["client"]
  let model!: HistoryModel
  let dispose!: () => void
  createRoot((cleanup) => {
    dispose = cleanup
    model = createHistoryModel("/repo")
    model.configure(client, 100, 0)
  })
  try {
    await flush()
    model.configure(client, 200, 0)
    await flush()
    pending[1]!.resolve({ commits: [], hasMore: false })
    await flush()
    pending[0]!.resolve({ commits: [], hasMore: true })
    await flush()
    assert.equal(model.history.latest?.hasMore, false)
    model.refresh()
    await flush()
    dispose()
    pending[2]!.resolve({ commits: [], hasMore: true })
    await flush()
    assert.equal(model.history.latest?.hasMore, false)
  } finally { dispose() }
})

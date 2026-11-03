import { strict as assert } from "node:assert"
import { test } from "node:test"
import { abortable, AsyncCache } from "./async-cache"

test("async cache deduplicates reads and starts TTL on completion, not request", async () => {
  let now = 0
  let calls = 0
  let resolve!: (value: number) => void
  const cache = new AsyncCache<number>(30, 2, () => now)
  const load = () => { calls++; return new Promise<number>((yes) => { resolve = yes }) }
  const first = cache.get("repo", load)
  const second = cache.get("repo", load)
  assert.equal(first, second)
  await Promise.resolve()
  assert.equal(calls, 1)
  now = 100
  resolve(42)
  assert.equal(await first, 42)
  now = 129
  assert.equal(await cache.get("repo", load), 42)
  now = 130
  assert.notEqual(cache.get("repo", async () => 43), first)
})

test("failed or invalidated in-flight entries cannot replace newer reads", async () => {
  const cache = new AsyncCache<number>(1000, 2)
  let reject!: (error: Error) => void
  const first = cache.get("repo", () => new Promise<number>((_resolve, no) => { reject = no }))
  await Promise.resolve()
  cache.invalidate("repo")
  const replacement = cache.get("repo", async () => 2)
  reject(new Error("offline"))
  await assert.rejects(first, /offline/)
  assert.equal(await replacement, 2)
  assert.equal(cache.get("repo", async () => 3), replacement)
  cache.invalidate("repo")
  await assert.rejects(cache.get("repo", async () => { throw new Error("retry") }), /retry/)
  assert.equal(await cache.get("repo", async () => 4), 4)
})

test("async cache evicts least recently used entries", async () => {
  const cache = new AsyncCache<number>(1000, 2)
  const first = cache.get("a", async () => 1)
  await first
  await cache.get("b", async () => 2)
  assert.equal(cache.get("a", async () => 99), first)
  await cache.get("c", async () => 3)
  assert.equal(await cache.get("b", async () => 4), 4)
})

test("cancelling one shared read does not cancel another consumer", async () => {
  const controller = new AbortController()
  let resolve!: (value: number) => void
  const shared = new Promise<number>((yes) => { resolve = yes })
  const cancelled = abortable(shared, controller.signal)
  const active = abortable(shared)
  controller.abort(new Error("cancelled"))
  await assert.rejects(cancelled, /cancelled/)
  resolve(42)
  assert.equal(await active, 42)
  await assert.rejects(abortable(Promise.resolve(1), controller.signal), /cancelled/)
})

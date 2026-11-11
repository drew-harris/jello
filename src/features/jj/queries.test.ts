import { strict as assert } from "node:assert"
import { test } from "node:test"
import { QueryObserver } from "@tanstack/solid-query"
import type { MountedSession } from "@opencode/plugin/gui"
import { createWindowQueries } from "../../shared/gui/query"
import { diffQuery, historyQuery, jjQueryKey, revisionFilesQuery } from "./queries"
import { diffTabID } from "./diff/tab"
import { createJJMutations } from "./mutations"

const flush = async () => { for (let index = 0; index < 30; index++) await Promise.resolve() }
const repository = { server: "remote", directory: "/repo" }

test("JJ queries isolate servers, checkouts, history limits and immutable revisions", async () => {
  const queries = createWindowQueries()
  let calls = 0
  const client = { rpc: () => ({ tree: async () => { calls++; return { commits: [], hasMore: false } } }) } as unknown as MountedSession["server"]["client"]
  const subscriptions: Array<() => void> = []
  try {
    for (const repo of [repository, { ...repository, server: "other" }, { ...repository, directory: "/other" }]) {
      const observer = new QueryObserver(queries.client, historyQuery(queries.client, repo, client, 100))
      subscriptions.push(observer.subscribe(() => {}))
    }
    const larger = new QueryObserver(queries.client, historyQuery(queries.client, repository, client, 200))
    subscriptions.push(larger.subscribe(() => {}))
    const immutable = revisionFilesQuery(queries.client, repository, client, "a".repeat(40))
    queries.client.setQueryData(immutable.queryKey, [])
    await flush()
    assert.equal(calls, 4)
    queries.invalidate(jjQueryKey(repository))
    await flush()
    assert.equal(calls, 6)
    assert.equal(queries.client.getQueryState(immutable.queryKey)?.isInvalidated, false)
  } finally { subscriptions.forEach((unsubscribe) => unsubscribe()); queries.dispose() }
})

test("all JJ writes use the same mutation/invalidation policy; failures never invalidate", async () => {
  const queries = createWindowQueries()
  const methods: string[] = []
  let reads = 0
  let fail = false
  const client = { rpc: () => new Proxy({}, { get: (_target, name: string) => async () => {
    if (name === "tree") { reads++; return { commits: [], hasMore: false } }
    methods.push(name)
    if (fail) throw new Error("write rejected")
    return {}
  } }) } as unknown as MountedSession["server"]["client"]
  const observer = new QueryObserver(queries.client, historyQuery(queries.client, repository, client, 100))
  const unsubscribe = observer.subscribe(() => {})
  try {
    await flush()
    const mutations = createJJMutations(queries, repository, client)
    const writes = [() => mutations.commit("message"), () => mutations.abandon("id"), () => mutations.describe("id", "message"),
      () => mutations.edit("id"), () => mutations.setBookmark("id", "name"), () => mutations.gitPush("id"),
      () => mutations.squashBelow("id", "parent"), () => mutations.newChange()]
    for (const write of writes) { await write(); await flush() }
    assert.deepEqual(methods, ["commit", "abandon", "describe", "edit", "setBookmark", "gitPush", "squashBelow", "newChange"])
    assert.equal(reads, 9)
    fail = true
    await assert.rejects(mutations.commit("message"), /write rejected/)
    await flush()
    assert.equal(reads, 9)
    assert.equal(queries.client.getMutationCache().getAll().at(-1)?.state.status, "error")
  } finally { unsubscribe(); queries.dispose() }
})

test("diff cache identity ignores a legacy file selection, but isolates exact versions and change targets", () => {
  const queries = createWindowQueries()
  const client = { rpc: () => ({}) } as unknown as MountedSession["server"]["client"]
  const commitID = "a".repeat(40)
  const changeID = "k".repeat(32)
  try {
    const exactID = diffTabID({ directory: repository.directory, commitID })
    const exact = diffQuery(queries.client, repository, client, exactID)
    const legacy = diffQuery(queries.client, repository, client, `${exactID}/file/a.ts`)
    const moving = diffQuery(queries.client, repository, client, diffTabID({ directory: repository.directory, changeID }))
    const other = diffQuery(queries.client, repository, client, diffTabID({ directory: repository.directory, commitID: "b".repeat(40) }))
    assert.deepEqual(exact.queryKey, legacy.queryKey)
    assert.notDeepEqual(exact.queryKey, moving.queryKey)
    assert.notDeepEqual(exact.queryKey, other.queryKey)
    assert.throws(() => diffQuery(queries.client, { ...repository, directory: "/wrong" }, client, exactID), /Invalid diff tab/)
  } finally { queries.dispose() }
})

test("immutable file lists are reused without polling or refetching on focus", async () => {
  const queries = createWindowQueries()
  let calls = 0
  const client = { rpc: () => ({ revisionFiles: async () => { calls++; return [{ path: "a.ts", status: "modified" }] } }) } as unknown as MountedSession["server"]["client"]
  const options = revisionFilesQuery(queries.client, repository, client, "a".repeat(40))
  const first = new QueryObserver(queries.client, options)
  const one = first.subscribe(() => {})
  let two = () => {}
  try {
    await flush()
    one()
    const second = new QueryObserver(queries.client, options)
    two = second.subscribe(() => {})
    queries.client.getQueryCache().onFocus()
    queries.invalidate(jjQueryKey(repository))
    await flush()
    assert.equal(calls, 1)
    assert.deepEqual(second.getCurrentResult().data, [{ path: "a.ts", status: "modified" }])
    assert.equal(options.refetchInterval, false)
  } finally { one(); two(); queries.dispose() }
})

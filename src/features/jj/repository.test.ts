import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { test } from "node:test"
import { QueryObserver, type QueryObserverResult } from "@tanstack/solid-query"
import { createRoot } from "solid-js"
import type { Plugin } from "@opencode/plugin"
import type { MountedSession } from "@opencode/plugin/gui"
import { createWindowQueries } from "../../shared/gui/query"
import { createDiffModel } from "./diff/state"
import { diffTabID } from "./diff/tab"
import { setupJJ } from "./server"
import { diffQuery, historyQuery, overviewQuery } from "./queries"
import { createJJMutations } from "./mutations"

const execute = promisify(execFile)
const settled = <T>(observer: QueryObserver<T, unknown>) => new Promise<void>((resolve, reject) => {
  let unsubscribe = () => {}
  const check = (result: QueryObserverResult<T, unknown>) => {
    if (result.isFetching || result.isPending) return
    unsubscribe()
    if (result.error) reject(result.error)
    else resolve()
  }
  unsubscribe = observer.subscribe(check)
  check(observer.getCurrentResult())
})

test("a real commit refreshes tree/status/diff once through centralized mutation policy without losing diff identity", { timeout: 30_000 }, async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true })
  const directory = await mkdtemp(join(tmpdir(), "opencode", "jello-queries-"))
  const queries = createWindowQueries()
  let dispose = () => {}
  const unsubscribes: Array<() => void> = []
  try {
    await execute("jj", ["git", "init", directory])
    await execute("jj", ["config", "set", "--repo", "user.name", "Jello Test"], { cwd: directory })
    await execute("jj", ["config", "set", "--repo", "user.email", "test@example.com"], { cwd: directory })
    await writeFile(join(directory, "example.ts"), "export const answer = 42\n")
    type Handler = (input: unknown, context: { signal: AbortSignal }) => Promise<unknown>
    let handlers!: Record<string, Handler>
    await setupJJ({ rpc: { register: async (_contract: unknown, implementation: Record<string, Handler>) => { handlers = implementation } } } as unknown as Plugin.Context)
    const calls: Record<string, number> = {}
    const methods = Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, async (input: unknown, options?: { signal: AbortSignal }) => {
      calls[name] = (calls[name] ?? 0) + 1
      return handler(input, { signal: options?.signal ?? new AbortController().signal })
    }]))
    const client = { rpc: () => methods } as unknown as MountedSession["server"]["client"]
    const repository = { server: "remote", directory }
    const history = new QueryObserver(queries.client, historyQuery(queries.client, repository, client, 100))
    unsubscribes.push(history.subscribe(() => {}))
    await settled(history)
    const status = new QueryObserver(queries.client, overviewQuery(queries.client, repository, client))
    unsubscribes.push(status.subscribe(() => {}))
    await settled(status)
    const current = history.getCurrentResult().data!.commits.find((commit) => commit.current)!
    const id = diffTabID({ directory, changeID: current.changeID })
    const diff = new QueryObserver(queries.client, diffQuery(queries.client, repository, client, id))
    unsubscribes.push(diff.subscribe(() => {}))
    await settled(diff)
    const navigation = createRoot((cleanup) => { dispose = cleanup; return createDiffModel(id) })
    navigation.selectPath("example.ts")
    navigation.setQuery("example")
    navigation.setSidebarWidth(320)
    const files = diff.getCurrentResult().data!.files
    await createJJMutations(queries, repository, client).commit("Keep behavior")
    await Promise.all([settled(history), settled(status), settled(diff)])
    assert.equal(calls.tree, 2)
    assert.equal(calls.overview, 2)
    assert.equal(calls.diff, 2)
    assert.equal(status.getCurrentResult().data!.revisions.find((revision) => revision.current)!.empty, true)
    assert.equal(history.getCurrentResult().data!.commits.find((commit) => commit.current)!.empty, true)
    assert.equal(diff.getCurrentResult().data!.data.revision.current, false)
    assert.equal(diff.getCurrentResult().data!.data.revision.description.trim(), "Keep behavior")
    assert.equal(diff.getCurrentResult().data!.files, files)
    assert.equal(navigation.path(), "example.ts")
    assert.equal(navigation.query(), "example")
    assert.equal(navigation.sidebarWidth(), 320)
  } finally {
    unsubscribes.forEach((unsubscribe) => unsubscribe())
    dispose()
    queries.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})

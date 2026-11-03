import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { test } from "node:test"
import { createEffect, createRoot } from "solid-js"
import { isServer } from "solid-js/web"
import type { Plugin } from "@opencode/plugin"
import type { MountedSession } from "@opencode/plugin/gui"
import { RepositoryEvents } from "../../shared/repository"
import { createAsyncAction } from "../../shared/gui/async-action"
import { createHistoryModel } from "./tree/state"
import { createStatusModel } from "./status-model"
import { createDiffModel } from "./diff/state"
import { diffTabID } from "./diff/tab"
import { setupJJ } from "./server"
import { JJ_CHANGED } from "./invalidation"

const execute = promisify(execFile)
type Result = { readonly loading: boolean; readonly error: unknown }
const settled = (result: Result) => new Promise<void>((resolve, reject) => {
  createRoot((dispose) => createEffect(() => {
    if (result.loading) return
    const error = result.error
    dispose()
    if (error) reject(error)
    else resolve()
  }))
})

test("a real commit invalidates tree/status/diff together without losing cached diff navigation", { skip: isServer, timeout: 30_000 }, async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true })
  const directory = await mkdtemp(join(tmpdir(), "opencode", "jello-resources-"))
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
    const models = createRoot((cleanup) => {
      dispose = cleanup
      return { history: createHistoryModel(directory), status: createStatusModel(directory) }
    })
    models.history.configure(client, 100, 0)
    await settled(models.history.result)
    models.status.configure(client)
    await settled(models.status.result)
    const current = models.history.history.latest!.commits.find((commit) => commit.current)!
    let disposeDiff = () => {}
    const diff = createRoot((cleanup) => {
      disposeDiff = cleanup
      return createDiffModel(diffTabID({ directory, changeID: current.changeID }))
    })
    unsubscribes.push(disposeDiff)
    diff.configure(client)
    await settled(diff.result)
    diff.setQuery("example")
    diff.setSidebarWidth(320)
    const files = diff.result.latest!.files
    const events = new RepositoryEvents()
    const repository = { server: "remote", directory }
    for (const model of [models.history, models.status, diff]) {
      unsubscribes.push(events.subscribe(repository, JJ_CHANGED, model.invalidate))
    }
    const action = createAsyncAction()
    await action.run(async () => { await methods.commit({ directory, message: "Keep behavior" }) }, {
      rethrow: true,
      onSuccess() {
        events.invalidate(repository, JJ_CHANGED)
        events.invalidate(repository, JJ_CHANGED)
      },
    })
    await Promise.all([settled(models.history.result), settled(models.status.result), settled(diff.result)])
    assert.equal(calls.tree, 2)
    assert.equal(calls.overview, 2)
    assert.equal(calls.diff, 2)
    assert.equal(models.status.result.latest!.revisions.find((revision) => revision.current)!.empty, true)
    assert.equal(models.history.result.latest!.commits.find((commit) => commit.current)!.empty, true)
    assert.equal(diff.result.latest!.data.revision.current, false, "committing must stop following the old working copy")
    assert.equal(diff.result.latest!.data.revision.description.trim(), "Keep behavior")
    assert.equal(diff.result.latest!.files, files, "an unchanged immutable patch retains renderer identities")
    assert.equal(diff.query(), "example")
    assert.equal(diff.sidebarWidth(), 320)
  } finally {
    unsubscribes.forEach((unsubscribe) => unsubscribe())
    dispose()
    await rm(directory, { recursive: true, force: true })
  }
})

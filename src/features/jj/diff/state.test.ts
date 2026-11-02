import { strict as assert } from "node:assert"
import { test } from "node:test"
import { createRoot } from "solid-js"
import { isServer } from "solid-js/web"
import type { MountedSession } from "@opencode/plugin/gui"
import { ViewModels } from "../view-models"
import { createDiffModel, type DiffModel } from "./state"
import { diffTabID } from "./tab"
import type { RevisionDiff } from "./server"

const patch = (name: string) => `diff --git a/${name} b/${name}
index 1111111..2222222 100644
--- a/${name}
+++ b/${name}
@@ -1 +1 @@
-before
+after
`
const revision = { commitID: "a".repeat(40), fullChangeID: "k".repeat(32), current: true, divergent: false } as RevisionDiff["revision"]
const id = diffTabID({ directory: "/repo", changeID: revision.fullChangeID })
const flush = async () => { await new Promise<void>((resolve) => queueMicrotask(resolve)); await Promise.resolve() }

test("diff models retain contents and navigation across remounts and reuse unchanged patches", { skip: isServer }, async () => {
  const requests: Array<{ knownCommitID?: string }> = []
  const updates: RevisionDiff[] = [
    { revision, patch: patch("a.txt") + patch("b.txt") },
    { revision, patch: "", unchanged: true },
    { revision: { ...revision, commitID: "b".repeat(40) }, patch: patch("new.txt") + patch("b.txt") + patch("a.txt") },
  ]
  const client = { rpc: () => ({ diff: async (input: { knownCommitID?: string }) => {
    requests.push(input)
    return updates.shift()!
  } }) } as unknown as MountedSession["server"]["client"]
  let models!: ViewModels<DiffModel>
  let model!: DiffModel
  let dispose!: () => void
  createRoot((cleanup) => { dispose = cleanup; models = new ViewModels() })
  try {
    createRoot((unmount) => {
      model = models.use(id, () => createDiffModel(id))
      model.configure(client)
      unmount()
    })
    await flush()
    assert.equal(model.result.latest?.files.length, 2)
    model.setSelected(1)
    model.setQuery("b")
    model.setSidebarWidth(320)
    const originalFiles = model.result.latest!.files
    createRoot((unmount) => {
      assert.equal(models.use(id, () => { throw new Error("must reuse") }), model)
      model.configure(client)
      assert.equal(model.selected(), 1)
      assert.equal(model.query(), "b")
      assert.equal(model.sidebarWidth(), 320)
      unmount()
    })
    await flush()
    assert.equal(requests.length, 1)
    model.refresh()
    await flush()
    assert.equal(requests[1]!.knownCommitID, revision.commitID)
    assert.equal(model.result.latest!.files, originalFiles)
    assert.equal(model.result.latest!.data.patch, patch("a.txt") + patch("b.txt"))
    model.refresh()
    await flush()
    assert.equal(model.result.latest!.files[model.selected()]!.name, "b.txt")
  } finally { dispose() }
})

test("diff refresh failures keep successful contents and apply backoff", { skip: isServer }, async () => {
  let fail = false
  const client = { rpc: () => ({ diff: async () => {
    if (fail) throw new Error("offline")
    return { revision, patch: patch("a.txt") }
  } }) } as unknown as MountedSession["server"]["client"]
  let model!: DiffModel
  let dispose!: () => void
  createRoot((cleanup) => { dispose = cleanup; model = createDiffModel(id); model.configure(client) })
  try {
    await flush()
    const previous = model.result.latest
    fail = true
    model.refresh()
    await flush()
    assert.equal(model.result.latest, previous)
    assert.equal((model.result.error as Error).message, "offline")
    assert.ok(model.nextDelay() > 0)
    assert.ok(model.lastFinished() > 0)
  } finally { dispose() }
})

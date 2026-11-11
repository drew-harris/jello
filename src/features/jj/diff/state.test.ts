import { strict as assert } from "node:assert"
import { test } from "node:test"
import { useQuery } from "@tanstack/solid-query"
import { createRoot } from "solid-js"
import { unwrap } from "solid-js/store"
import { isServer } from "solid-js/web"
import type { MountedSession } from "@opencode/plugin/gui"
import { ViewModels } from "../../../shared/gui/view-models"
import { createWindowQueries, queryData } from "../../../shared/gui/query"
import { createDiffModel, type DiffModel } from "./state"
import { diffFileIndex, diffTabID } from "./tab"
import { diffQuery } from "../queries"
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
const repository = { server: "remote", directory: "/repo" }
const id = diffTabID({ directory: "/repo", changeID: revision.fullChangeID })
const flush = async () => { for (let index = 0; index < 30; index++) await Promise.resolve() }

test("diff queries retain raw renderer identity while UI models retain only navigation across remounts", { skip: isServer }, async () => {
  const queries = createWindowQueries()
  const requests: Array<{ knownCommitID?: string }> = []
  const updates: RevisionDiff[] = [
    { revision, patch: patch("a.txt") + patch("b.txt") },
    { revision, patch: "", unchanged: true },
    { revision: { ...revision, commitID: "b".repeat(40) }, patch: patch("new.txt") + patch("b.txt") + patch("a.txt") },
  ]
  const client = { rpc: () => ({ diff: async (input: { knownCommitID?: string }) => { requests.push(input); return updates.shift()! } }) } as unknown as MountedSession["server"]["client"]
  let models!: ViewModels<DiffModel>
  let dispose!: () => void
  let unmount = () => {}
  createRoot((cleanup) => { dispose = cleanup; models = new ViewModels() })
  const mount = () => createRoot((cleanup) => {
    unmount = cleanup
    return { model: models.use(id, () => createDiffModel(id)), remote: useQuery(() => diffQuery(queries.client, repository, client, id), () => queries.client) }
  })
  try {
    const first = mount()
    await flush()
    assert.equal(queryData(first.remote)?.files.length, 2)
    first.model.selectPath("b.txt")
    first.model.setQuery("b")
    first.model.setSidebarWidth(320)
    const originalFiles = unwrap(queryData(first.remote)!.files)
    unmount()
    const second = mount()
    await flush()
    assert.equal(second.model, first.model)
    assert.equal(requests.length, 1)
    assert.equal(second.model.query(), "b")
    assert.equal(second.model.sidebarWidth(), 320)
    await second.remote.refetch({ cancelRefetch: false })
    await flush()
    assert.equal(requests[1]!.knownCommitID, revision.commitID)
    assert.equal(unwrap(queryData(second.remote)!.files), originalFiles)
    assert.equal(queryData(second.remote)!.data.patch, patch("a.txt") + patch("b.txt"))
    await second.remote.refetch({ cancelRefetch: false })
    await flush()
    const files = queryData(second.remote)!.files
    assert.equal(files[diffFileIndex(files, second.model.path())].name, "b.txt")
    assert.equal(unwrap(files[1]), originalFiles[1])
  } finally { unmount(); dispose(); queries.dispose() }
})

test("diff refresh failures retain successful contents and error state", { skip: isServer }, async () => {
  const queries = createWindowQueries()
  let fail = false
  const client = { rpc: () => ({ diff: async () => {
    if (fail) throw new Error("offline")
    return { revision, patch: patch("a.txt") }
  } }) } as unknown as MountedSession["server"]["client"]
  let dispose!: () => void
  const remote = createRoot((cleanup) => { dispose = cleanup; return useQuery(() => diffQuery(queries.client, repository, client, id), () => queries.client) })
  try {
    await flush()
    const previous = unwrap(queryData(remote))
    fail = true
    await remote.refetch({ cancelRefetch: false })
    await flush()
    assert.equal(unwrap(queryData(remote)), previous)
    assert.equal((remote.error as Error).message, "offline")
  } finally { dispose(); queries.dispose() }
})

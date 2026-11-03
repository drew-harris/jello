import { strict as assert } from "node:assert"
import { test } from "node:test"
import { createChangeActions } from "./actions"
import type { TreeCommit } from "./model"

const commit = (overrides: Partial<TreeCommit> = {}): TreeCommit => ({
  commitID: "a".repeat(40), changeID: "k".repeat(32), parents: ["b".repeat(40)], bookmarks: [], immutable: false,
  ...overrides,
} as TreeCommit)

test("menus and keyboard actions use the same mutable/root/busy guards", () => {
  let busy = false
  const runs: string[] = []
  const actions = createChangeActions({ busy: () => busy, commits: () => [], run: (id, _target, source) => { runs.push(`${id}:${source}`) } })
  const find = (id: string) => actions.find((action) => action.id === id)!
  for (const source of ["keyboard", "menu"] as const) {
    for (const id of ["edit", "describe", "abandon", "squash"]) {
      find(id).run(commit({ immutable: true }), source)
      find(id).run(commit({ commitID: "0".repeat(40) }), source)
    }
    find("push").run(commit(), source)
    find("edit").run(commit(), source)
  }
  assert.deepEqual(runs, ["edit:keyboard", "edit:menu"])
  busy = true
  for (const action of actions) action.run(commit({ bookmarks: ["main"] }), "keyboard")
  assert.equal(runs.length, 2)
})

test("squash availability checks direct parents, including unloaded parents", () => {
  const runs: string[] = []
  const parent = commit({ commitID: "b".repeat(40), immutable: true })
  const actions = createChangeActions({ busy: () => false, commits: () => [parent], run: (id) => { runs.push(id) } })
  const squash = actions.find((action) => action.id === "squash")!
  squash.run(commit())
  squash.run(commit({ parents: [] }))
  squash.run(commit({ parents: ["0".repeat(40)] }))
  assert.deepEqual(runs, [])
  squash.run(commit({ parents: ["c".repeat(40)] }))
  assert.deepEqual(runs, ["squash"], "unloaded parent details are validated by the squash dialog/server")
})

import { strict as assert } from "node:assert"
import { test } from "node:test"
import { parseRevisions, type Revision } from "./overview"

test("parses current and parent revisions with safely escaped metadata", () => {
  const revisions: Revision[] = [
    { commitID: "a".repeat(40), changeID: "abc", timestamp: "2026-10-31T00:00:00-07:00", bookmarks: ["feature/ui"], description: 'Fix "quoted" text → done', empty: false, immutable: false, current: true, depth: 0 },
    { commitID: "b".repeat(40), changeID: "xyz", timestamp: "2026-10-30T00:00:00-07:00", bookmarks: ["main"], description: "", empty: true, immutable: true, current: false, depth: 1 },
    { commitID: "c".repeat(40), changeID: "uvw", timestamp: "2026-10-29T00:00:00-07:00", bookmarks: [], description: "Earlier change", empty: false, immutable: true, current: false, depth: 2 },
  ].map((revision) => ({ ...revision, changeID8: revision.changeID.padEnd(8, "x") }))
  assert.deepEqual(parseRevisions(revisions.map((revision) => JSON.stringify(revision)).join("\n") + "\n"), revisions)
})

test("handles no parents and multiple parents without inventing revisions", () => {
  assert.deepEqual(parseRevisions("\n"), [])
  const revision = { changeID: "abc", bookmarks: [], description: "", empty: true, immutable: false, current: true }
  assert.equal(parseRevisions(JSON.stringify(revision)).length, 1)
  assert.equal(parseRevisions([revision, { ...revision, current: false }, { ...revision, current: false }].map((item) => JSON.stringify(item)).join("\n")).length, 3)
})

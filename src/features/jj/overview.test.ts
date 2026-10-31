import { strict as assert } from "node:assert"
import { test } from "node:test"
import { parseRevisions, type Revision } from "./overview"

test("parses current and parent revisions with safely escaped metadata", () => {
  const revisions: Revision[] = [
    { changeID: "abc", bookmarks: ["feature/ui"], description: 'Fix "quoted" text → done', empty: false, immutable: false, current: true },
    { changeID: "xyz", bookmarks: ["main"], description: "", empty: true, immutable: true, current: false },
  ]
  assert.deepEqual(parseRevisions(revisions.map((revision) => JSON.stringify(revision)).join("\n") + "\n"), revisions)
})

test("handles no parents and multiple parents without inventing revisions", () => {
  assert.deepEqual(parseRevisions("\n"), [])
  const revision = { changeID: "abc", bookmarks: [], description: "", empty: true, immutable: false, current: true }
  assert.equal(parseRevisions(JSON.stringify(revision)).length, 1)
  assert.equal(parseRevisions([revision, { ...revision, current: false }, { ...revision, current: false }].map((item) => JSON.stringify(item)).join("\n")).length, 3)
})

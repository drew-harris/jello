import { strict as assert } from "node:assert"
import { test } from "node:test"
import { matchingBookmarks } from "./bookmark-completion"

test("partial bookmark names complete to existing names rather than creating a prefix", () => {
  assert.deepEqual(matchingBookmarks(["main", "feature/tree"], "mai"), ["main"])
  assert.deepEqual(matchingBookmarks(["main", "feature/tree"], "TREE"), ["feature/tree"])
  assert.deepEqual(matchingBookmarks(["main", "feature/tree"], "new-bookmark"), [])
})

test("exact names rank ahead of prefixes, and prefixes ahead of substring matches", () => {
  assert.deepEqual(matchingBookmarks(["feature/main", "main-extra", "main"], "main"), ["main", "main-extra", "feature/main"])
  assert.deepEqual(matchingBookmarks(["feature/main", "main-extra", "main"], " mai "), ["main-extra", "main", "feature/main"])
})

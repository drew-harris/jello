import { strict as assert } from "node:assert"
import { test } from "node:test"
import { countLineChanges } from "./line-changes"

test("counts replacements separately from extra added lines", () => {
  assert.deepEqual(countLineChanges("diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,2 +1,3 @@\n-old\n-older\n+new\n+newer\n+extra\n"),
    { modified: 2, added: 1, deleted: 0 })
})

test("does not pair edits separated by unchanged context", () => {
  assert.deepEqual(countLineChanges("@@ -1,2 +1,2 @@\n-old\n unchanged\n+new\n"),
    { modified: 0, added: 1, deleted: 1 })
})

test("does not pair edits across files or hunks", () => {
  assert.deepEqual(countLineChanges("diff --git a/a b/a\n@@ -1 +0,0 @@\n-old\ndiff --git a/b b/b\n@@ -0,0 +1 @@\n+new\n@@ -20,0 +20 @@\n+other\n"),
    { modified: 0, added: 2, deleted: 1 })
})

test("counts lines resembling diff headers and ignores newline markers", () => {
  assert.deepEqual(countLineChanges("@@ -1 +1 @@\n--- old content\n\\ No newline at end of file\n+++ new content\n\\ No newline at end of file\n"),
    { modified: 1, added: 0, deleted: 0 })
})

test("empty, binary, and rename-only diffs contribute no text lines", () => {
  for (const diff of ["", "diff --git a/a b/a\nBinary files a/a and b/a differ\n", "diff --git a/a b/b\nrename from a\nrename to b\n"]) {
    assert.deepEqual(countLineChanges(diff), { modified: 0, added: 0, deleted: 0 })
  }
})

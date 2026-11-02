import { strict as assert } from "node:assert"
import { test } from "node:test"
import type { Comment, ComposerFile, SessionScreen } from "@opencode/plugin/gui"
import { parseDiffFromFile, parsePatchFiles } from "@pierre/diffs"
import { diffCommentPreview, removeDiffComment, saveDiffComment, updateDiffComment } from "./annotations"

const file = parsePatchFiles(`diff --git a/old.ts b/new.ts
similarity index 80%
rename from old.ts
rename to new.ts
--- a/old.ts
+++ b/new.ts
@@ -40,3 +40,4 @@
 before
-old
+new
+extra
 after
@@ -90,2 +91,2 @@
 later
-gone
+replacement
`)[0].files[0]

test("preview matches native review: two plain-text lines from the ending side", () => {
  assert.equal(diffCommentPreview(file, { start: 43, end: 41 }), "new\nextra")
  assert.equal(diffCommentPreview(file, { start: 91, end: 92 }), "later\nreplacement")
  assert.equal(diffCommentPreview(file, { start: 41, end: 41, side: "deletions" }), "old")
  assert.equal(diffCommentPreview(file, { start: 91, end: 91, side: "deletions" }), "gone")
  assert.equal(diffCommentPreview(file, { start: 41, end: 42, side: "deletions", endSide: "additions" }), "new\nextra")
  assert.equal(diffCommentPreview(file, { start: 1, end: 2 }), undefined)
})

test("preview preserves blank lines and supports deleted files", () => {
  const added = parseDiffFromFile({ name: "a.ts", contents: "" }, { name: "a.ts", contents: "one\r\n\r\nthree" })
  assert.equal(diffCommentPreview(added, { start: 1, end: 3 }), "one\n")
  const deleted = parseDiffFromFile({ name: "a.ts", contents: "gone" }, { name: "a.ts", contents: "" })
  assert.equal(diffCommentPreview(deleted, { start: 1, end: 1, side: "deletions" }), "gone")
})

function workspace() {
  const comments: Comment[] = []
  const attachments: ComposerFile[] = []
  const updated: unknown[] = []
  const removed: string[] = []
  const detached: string[] = []
  const screen = {
    comment: {
      add(input: Omit<Comment, "id" | "time">) {
        const saved = { ...input, id: "comment-1", time: 100 }
        comments.push(saved)
        return saved
      },
      update(id: string, comment: string) { updated.push({ id, comment }) },
      remove(id: string) { removed.push(id) },
    },
    composer: {
      quotable: () => true,
      attach(part: ComposerFile) { attachments.push(part) },
      update(id: string, patch: unknown) { updated.push({ id, patch }) },
      detach(id: string) { detached.push(id) },
    },
  } as unknown as SessionScreen
  return { screen, comments, attachments, updated, removed, detached }
}

test("save uses exactly the native review comment and file attachment payload", () => {
  const w = workspace()
  const selection = { start: 43, end: 41, side: "deletions", endSide: "additions" } as const
  const saved = saveDiffComment(w.screen, { file: file.name, selection, comment: "  check this  ", preview: "new\nextra" })
  assert.deepEqual(w.comments, [{ id: "comment-1", time: 100, file: "new.ts", selection, comment: "check this" }])
  assert.deepEqual(w.attachments, [{
    type: "file", path: "new.ts", selection: { startLine: 41, endLine: 43, startChar: 0, endChar: 0 },
    comment: "check this", commentID: saved!.id, commentOrigin: "review", preview: "new\nextra",
  }])
  // No code quote, JJ-specific subject, revision text, or direct prompt writes.
  assert.equal(w.attachments[0].type, "file")
})

test("empty or disabled drafts attach nothing; editing/deletion sync both host models", () => {
  const w = workspace()
  const input = { file: file.name, selection: { start: 41, end: 41 }, comment: " " }
  assert.equal(saveDiffComment(w.screen, input), undefined)
  w.screen.composer.quotable = () => false
  assert.equal(saveDiffComment(w.screen, { ...input, comment: "hello" }), undefined)
  assert.equal(w.comments.length, 0)
  assert.equal(w.attachments.length, 0)
  updateDiffComment(w.screen, "comment-1", " edited ")
  assert.deepEqual(w.updated, [{ id: "comment-1", comment: "edited" }, { id: "comment-1", patch: { comment: "edited" } }])
  removeDiffComment(w.screen, "comment-1")
  assert.deepEqual(w.removed, ["comment-1"])
  assert.deepEqual(w.detached, ["comment-1"])
})

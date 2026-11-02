import type { SessionScreen } from "@opencode/plugin/gui"
import type { FileDiffMetadata, SelectedLineRange } from "@pierre/diffs"

// Matches OpenCode's review selectionPreview, but translates absolute line
// numbers into our bounded patch's hunk arrays. Preview is UI-only, not a quote.
export function diffCommentPreview(file: FileDiffMetadata, range: SelectedLineRange) {
  const side = range.endSide ?? range.side ?? "additions"
  const start = Math.max(1, Math.min(range.start, range.end))
  const end = Math.max(range.start, range.end)
  const lines: string[] = []
  for (const hunk of file.hunks) {
    const first = side === "deletions" ? hunk.deletionStart : hunk.additionStart
    const count = side === "deletions" ? hunk.deletionCount : hunk.additionCount
    const index = side === "deletions" ? hunk.deletionLineIndex : hunk.additionLineIndex
    const contents = side === "deletions" ? file.deletionLines : file.additionLines
    for (let line = Math.max(first, start); line <= Math.min(first + count - 1, end); line++) {
      lines.push(contents[index + line - first].replace(/\r?\n$/, ""))
      if (lines.length === 2) return lines.join("\n")
    }
  }
  return lines.length ? lines.join("\n") : undefined
}

// Deliberately use the same APIs and attachment shape as OpenCode's
// packages/gui-plugins/src/review/model.ts. The host formats the prompt,
// resolves file references, persists drafts, and restores sent comments.
export function saveDiffComment(screen: SessionScreen, input: {
  file: string
  selection: SelectedLineRange
  comment: string
  preview?: string
}) {
  const comment = input.comment.trim()
  if (!comment || !screen.composer.quotable()) return undefined
  const saved = screen.comment.add({ file: input.file, selection: { ...input.selection }, comment })
  screen.composer.attach({
    type: "file",
    path: input.file,
    selection: {
      startLine: Math.min(input.selection.start, input.selection.end),
      endLine: Math.max(input.selection.start, input.selection.end),
      startChar: 0,
      endChar: 0,
    },
    comment,
    commentID: saved.id,
    commentOrigin: "review",
    preview: input.preview,
  })
  return saved
}

export function updateDiffComment(screen: SessionScreen, id: string, comment: string) {
  if (!comment.trim()) return
  screen.comment.update(id, comment.trim())
  screen.composer.update(id, { comment: comment.trim() })
}

export function removeDiffComment(screen: SessionScreen, id: string) {
  screen.comment.remove(id)
  screen.composer.detach(id)
}

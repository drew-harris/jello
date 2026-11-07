import type { FileDiffMetadata, SelectedLineRange } from "@pierre/diffs"
export { saveDiffComment, updateDiffComment, removeDiffComment } from "../../../shared/gui/comment-attachments"

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

import type { SessionScreen } from "@opencode/plugin/gui"
import type { SelectedLineRange } from "@pierre/diffs"

// Match the host review model's attachment format, including its comment ID.
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

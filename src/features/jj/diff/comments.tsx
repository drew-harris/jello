import type { SessionScreen } from "@opencode/plugin/gui"
import type { FileDiffMetadata, SelectedLineRange } from "@pierre/diffs"
import type { Accessor } from "solid-js"
import { createLineComments } from "../../../shared/gui/line-comments"
import { diffCommentPreview } from "./annotations"

export type { CommentAnnotation as DiffAnnotation } from "../../../shared/gui/line-comments"

export function createDiffComments(screen: Accessor<SessionScreen>, clearSelection: () => void) {
  const comments = createLineComments(screen, clearSelection)
  return {
    ...comments,
    annotations: (file: FileDiffMetadata) => comments.annotations(file.name),
    open: (file: FileDiffMetadata, range: SelectedLineRange | null) => comments.open(file.name, range, range ? diffCommentPreview(file, range) : undefined),
  }
}

export type DiffComments = ReturnType<typeof createDiffComments>

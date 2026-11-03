import type { DiffTokenEventBaseProps } from "@pierre/diffs"
import { sourceToken } from "../../../intelligence/position"
export { identifierAt, isSelectedOccurrence, tokenPosition } from "../../../intelligence/position"

export function contextToken(event: MouseEvent): DiffTokenEventBaseProps | undefined {
  const token = sourceToken(event)
  if (!token) return
  const row = token.tokenElement.closest<HTMLElement>("[data-line]")
  return { ...token, side: token.tokenElement.closest("[data-code][data-deletions]") || row?.dataset.lineType === "change-deletion" ? "deletions" : "additions" }
}

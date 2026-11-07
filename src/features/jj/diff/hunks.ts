import type { Hunk } from "@pierre/diffs"

export { adjacentHunk, type HunkNavigator, type RegisterHunkNavigator } from "../../../shared/gui/hunk-navigation"

export function hunkLine(hunk: Hunk) {
  return hunk.additionCount > 0
    ? { lineNumber: hunk.additionStart, side: "additions" as const }
    : { lineNumber: hunk.deletionStart, side: "deletions" as const }
}

export function hunkRow(container: HTMLElement, hunk: Hunk) {
  const { lineNumber, side } = hunkLine(hunk)
  for (const node of container.querySelectorAll<HTMLElement>("diffs-container")) {
    const root = node.shadowRoot ?? node
    const row = [...root.querySelectorAll<HTMLElement>(`[data-line="${lineNumber}"]`)].find((row) =>
      side === "deletions"
        ? row.dataset.lineType !== "change-addition" && !row.closest("[data-code][data-additions]")
        : row.dataset.lineType !== "change-deletion" && !row.closest("[data-code][data-deletions]"))
    if (row) return row
  }
}

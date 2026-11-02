import type { FileDiffMetadata } from "@pierre/diffs"
import type { PeekKind, PeekResult } from "./rpc"

export function localDefinition(kind: PeekKind, result: PeekResult) {
  return kind === "definition" && result.sameFile && result.locations.length === 1 ? result.locations[0] : undefined
}

export function hasDefinitionLine(file: FileDiffMetadata, line: number) {
  return file.hunks.some((hunk) => line + 1 >= hunk.additionStart && line + 1 < hunk.additionStart + hunk.additionCount)
}

export const nextDefinitionFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

export function definitionRow(container: HTMLElement, line: number) {
  for (const node of container.querySelectorAll<HTMLElement>("diffs-container")) {
    const root = node.shadowRoot ?? node
    const row = [...root.querySelectorAll<HTMLElement>(`[data-line="${line + 1}"]`)].find((row) =>
      row.dataset.lineType !== "change-deletion" && !row.closest("[data-code][data-deletions]"))
    if (row) return row
  }
}

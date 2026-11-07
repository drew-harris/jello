import type { SourceDocument } from "./rpc"

export interface FileChange { line: number; kind: "added" | "modified" | "deleted"; layer: "current" | "branch" }
export interface FileChanges { markers: FileChange[]; note?: string }
export type FileChangeProvider = (document: SourceDocument, signal: AbortSignal) => Promise<FileChanges>

// Gutter signs are per-line; contiguous signs form one navigable change region.
export function changeHunkLines(markers: FileChange[]): number[] {
  const lines = [...new Set(markers.map((marker) => marker.line))].sort((a, b) => a - b)
  return lines.filter((line, index) => index === 0 || line > lines[index - 1] + 1)
}

// Zero-context git hunks use one-based destination lines. Deletions are anchored
// to the preceding surviving line (or the first line for a deletion at BOF).
export function patchMarkers(patch: string, layer: FileChange["layer"], lineCount: number): FileChange[] {
  const result: FileChange[] = []
  for (const match of patch.matchAll(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    const removed = Number(match[1] ?? 1)
    const start = Number(match[2])
    const added = Number(match[3] ?? 1)
    if (!added) result.push({ line: Math.max(0, Math.min(lineCount - 1, start - 1)), kind: "deleted", layer })
    else for (let index = 0; index < added && start + index <= lineCount; index++) {
      result.push({ line: start + index - 1, kind: index < removed ? "modified" : "added", layer })
    }
  }
  return result
}

export function mergeMarkers(branch: FileChange[], current: FileChange[]) {
  return [...new Map([...branch, ...current].map((marker) => [marker.line, marker])).values()]
}

export const gutterCSS = `
  [data-gutter] [data-jello-change] { position: relative; }
  [data-gutter] [data-jello-change]::before {
    content: ""; position: absolute; left: 2px; top: 0; bottom: 0; width: 5px;
    box-sizing: border-box; border: solid var(--jello-sign); border-width: 0 1px;
    background: var(--jello-sign); pointer-events: none;
  }
  [data-gutter] [data-jello-change-start]::before { border-top-width: 1px; }
  [data-gutter] [data-jello-change-end]::before { border-bottom-width: 1px; }
  [data-jello-change="added"] { --jello-sign: #3fb950; }
  [data-jello-change="modified"] { --jello-sign: #539bf5; }
  [data-jello-change="deleted"] { --jello-sign: #f47067; }
  [data-gutter] [data-jello-layer="branch"]::before { background: transparent; opacity: .25; }
  [data-gutter] [data-jello-change="deleted"]::before { top: auto; bottom: 0; height: 5px; width: 8px; border-width: 1px; }
`

export function paintGutter(root: ParentNode, markers: FileChange[]) {
  const byLine = new Map(markers.map((marker) => [marker.line, marker]))
  const connects = (marker: FileChange, neighbor: FileChange | undefined) => marker.kind !== "deleted"
    && neighbor?.kind === marker.kind && neighbor.layer === marker.layer
  for (const cell of root.querySelectorAll<HTMLElement>("[data-gutter] [data-column-number]")) {
    const line = Number(cell.dataset.columnNumber) - 1
    const marker = byLine.get(line)
    if (marker) {
      cell.dataset.jelloChange = marker.kind
      cell.dataset.jelloLayer = marker.layer
      // Use the full marker map, not DOM siblings: the neighboring row might
      // be outside CodeView's virtual window or span multiple wrapped lines.
      cell.toggleAttribute("data-jello-change-start", !connects(marker, byLine.get(line - 1)))
      cell.toggleAttribute("data-jello-change-end", !connects(marker, byLine.get(line + 1)))
      cell.title = `${marker.kind} · ${marker.layer === "current" ? "current JJ change" : "since main/master fork"}`
    } else if (cell.dataset.jelloChange) {
      delete cell.dataset.jelloChange
      delete cell.dataset.jelloLayer
      cell.removeAttribute("data-jello-change-start")
      cell.removeAttribute("data-jello-change-end")
      cell.removeAttribute("title")
    }
  }
}

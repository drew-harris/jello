import type { CodeViewFileItem, CodeViewLineScrollTarget } from "@pierre/diffs"
import type { PeekLocation, SourceDocument } from "./rpc"

export function sourceItem(document: SourceDocument, version: number): CodeViewFileItem {
  return { id: document.path, type: "file", file: { name: document.path, contents: document.text }, version }
}

export function sourceScrollTarget(document: SourceDocument, location: PeekLocation): CodeViewLineScrollTarget {
  const lines = document.text.split("\n")
  const count = Math.max(1, lines.length - (lines.at(-1) === "" ? 1 : 0))
  return { type: "line", id: document.path, lineNumber: Math.max(1, Math.min(count, location.line + 1)), align: "center", behavior: "instant" }
}

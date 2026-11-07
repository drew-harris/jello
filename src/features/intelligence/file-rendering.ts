import type { CodeViewFileItem, CodeViewLineScrollTarget, LineAnnotation, SelectedLineRange } from "@pierre/diffs"
import type { PeekLocation, SourceDocument } from "./rpc"

export function sourceItem<Metadata = undefined>(document: SourceDocument, version: number, annotations?: LineAnnotation<Metadata>[]): CodeViewFileItem<Metadata> {
  return { id: document.path, type: "file", file: { name: document.path, contents: document.text }, version, annotations }
}

export function sourceCommentPath(path: string, directory: string) {
  const prefix = `${directory.replace(/\/$/, "")}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

export function sourceCommentPreview(document: SourceDocument, range: SelectedLineRange) {
  const start = Math.max(1, Math.min(range.start, range.end))
  const end = Math.max(range.start, range.end)
  return document.text.split(/\r?\n/).slice(start - 1, Math.min(end, start + 1)).join("\n")
}

export function sourceScrollTarget(document: SourceDocument, location: PeekLocation): CodeViewLineScrollTarget {
  const lines = document.text.split("\n")
  const count = Math.max(1, lines.length - (lines.at(-1) === "" ? 1 : 0))
  return { type: "line", id: document.path, lineNumber: Math.max(1, Math.min(count, location.line + 1)), align: "center", behavior: "instant" }
}

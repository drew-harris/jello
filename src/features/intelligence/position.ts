import type { TokenEventBase } from "@pierre/diffs"
import type { PeekLocation, SymbolPosition } from "./rpc"

export function isSelectedOccurrence(selected: SymbolPosition | undefined, occurrences: PeekLocation[], position: SymbolPosition) {
  if (!selected || selected.path !== position.path || selected.text !== position.text) return false
  return (selected.line === position.line && selected.character === position.character)
    || occurrences.some((item) => item.line === position.line && item.character === position.character)
}

export function identifierAt(text: string, offset: number) {
  for (const match of text.matchAll(/[$\p{ID_Start}_][$\p{ID_Continue}\u200c\u200d]*/gu)) {
    if (offset >= match.index && offset < match.index + match[0].length) return { text: match[0], start: match.index }
  }
}

export function sourceToken(event: MouseEvent): TokenEventBase | undefined {
  const element = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute("data-char"))
  const row = element?.closest<HTMLElement>("[data-line]")
  if (!element || !row) return
  const lineCharStart = Number(element.dataset.char)
  const lineNumber = Number(row.dataset.line)
  if (!Number.isInteger(lineCharStart) || !Number.isInteger(lineNumber)) return
  const tokenText = element.textContent ?? ""
  return { type: "token", tokenElement: element, tokenText, lineNumber, lineCharStart, lineCharEnd: lineCharStart + tokenText.length }
}

export function tokenPosition(path: string, token: TokenEventBase, event: MouseEvent): SymbolPosition | undefined {
  // Syntax tokens can contain several identifiers. Keep actual clicked UTF-16
  // offsets, including inside the virtualized renderer's shadow root.
  const element = token.tokenElement
  const root = element.getRootNode()
  const doc = element.ownerDocument as Document & {
    caretPositionFromPoint?(x: number, y: number, options?: { shadowRoots: ShadowRoot[] }): { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?(x: number, y: number): Range | null
  }
  const caret = doc.caretPositionFromPoint?.(event.clientX, event.clientY, { shadowRoots: root instanceof ShadowRoot ? [root] : [] })
  const fallback = !caret ? doc.caretRangeFromPoint?.(event.clientX, event.clientY) : undefined
  const node = caret?.offsetNode ?? fallback?.startContainer
  const offset = caret?.offset ?? fallback?.startOffset
  let local = 0
  if (node && offset !== undefined && element.contains(node)) {
    const range = doc.createRange()
    range.selectNodeContents(element)
    range.setEnd(node, offset)
    local = range.toString().length
    if (local === token.tokenText.length) local--
  }
  const identifier = identifierAt(token.tokenText, local)
  if (!identifier) return
  const expectedLine = element.closest("[data-line]")?.textContent?.replace(/\r?\n$/, "")
  if (expectedLine === undefined) return
  return { path, line: token.lineNumber - 1, character: token.lineCharStart + identifier.start, text: identifier.text, expectedLine }
}

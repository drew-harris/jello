import { createEffect, onCleanup, untrack, type Accessor } from "solid-js"
import type { PeekLocation } from "./rpc"

export interface SymbolHighlights {
  target: Accessor<{ path: string; line: number; character: number } | undefined>
  occurrences: Accessor<PeekLocation[]>
  definition: Accessor<PeekLocation | undefined>
}

export function occurrenceSlice(location: PeekLocation, line: number, start: number, length: number) {
  if (line < location.line || line > location.endLine) return
  const from = Math.max(0, line === location.line ? location.character - start : 0)
  const to = Math.min(length, line === location.endLine ? location.endCharacter - start : length)
  if (to <= from) return
  return { from, to }
}

function textRange(element: HTMLElement, from: number, to: number) {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const range = element.ownerDocument.createRange()
  let offset = 0
  let started = false
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0
    if (!started && from < offset + length) {
      range.setStart(node, from - offset)
      started = true
    }
    if (started && to <= offset + length) {
      range.setEnd(node, to - offset)
      return range
    }
    offset += length
  }
}

export interface OccurrenceBox { left: number; top: number; right: number; bottom: number; active: boolean }

export function mergeOccurrenceBoxes(boxes: OccurrenceBox[]) {
  const result: OccurrenceBox[] = []
  for (const box of [...boxes].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const previous = result.at(-1)
    if (previous && previous.active === box.active && Math.abs(previous.top - box.top) < 1
      && Math.abs(previous.bottom - box.bottom) < 1 && box.left <= previous.right + 1) {
      previous.right = Math.max(previous.right, box.right)
    } else result.push({ ...box })
  }
  return result
}

// Custom Highlight pseudo-elements cannot draw rounded borders. Paint small,
// noninteractive range overlays instead, leaving Pierre's token DOM untouched.
export function createOccurrenceHighlights(peek: SymbolHighlights) {
  const roots = new Map<HTMLElement, { path: string; layer: HTMLElement; root: ShadowRoot | HTMLElement }>()
  let frame: number | undefined
  const schedule = () => {
    if (frame !== undefined) return
    frame = requestAnimationFrame(() => { frame = undefined; refresh() })
  }
  const observer = new ResizeObserver(schedule)
  const refresh = () => untrack(() => {
    const target = peek.target()
    for (const { layer } of roots.values()) layer.replaceChildren()
    if (!target) return
    const byLine = new Map<number, PeekLocation[]>()
    const definition = peek.definition()
    for (const location of [...peek.occurrences(), ...(definition ? [definition] : [])]) {
      for (let line = location.line; line <= location.endLine; line++) {
        const list = byLine.get(line) ?? []
        list.push(location)
        byLine.set(line, list)
      }
    }
    for (const [node, { path, root, layer }] of roots) {
      if (path !== target.path) continue
      const host = node.getBoundingClientRect()
      const boxes: OccurrenceBox[] = []
      const clips = new Map<Element, { left: number; top: number; right: number; bottom: number }>()
      for (const token of root.querySelectorAll<HTMLElement>("[data-line] [data-char]")) {
        const row = token.closest<HTMLElement>("[data-line]")!
        // Working-copy semantics must never be painted onto old-side code.
        if (token.closest("[data-code][data-deletions]") || row.dataset.lineType === "change-deletion") continue
        const line = Number(row.dataset.line) - 1
        const start = Number(token.dataset.char)
        for (const location of byLine.get(line) ?? []) {
          const slice = occurrenceSlice(location, line, start, token.textContent?.length ?? 0)
          if (!slice) continue
          const range = textRange(token, slice.from, slice.to)
          if (!range) continue
          const selected = definition ? line === definition.line && location.character === definition.character
            : line === target.line && location.character === target.character
          const code = token.closest("[data-code]") ?? token
          let clip = clips.get(code)
          if (!clip) {
            clip = { left: host.left, top: host.top, right: host.right, bottom: host.bottom }
            for (let parent: Element | null = code; parent; parent = parent.parentElement) {
              const style = getComputedStyle(parent)
              const rect = parent.getBoundingClientRect()
              if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
                clip.left = Math.max(clip.left, rect.left)
                clip.right = Math.min(clip.right, rect.right)
              }
              if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
                clip.top = Math.max(clip.top, rect.top)
                clip.bottom = Math.min(clip.bottom, rect.bottom)
              }
            }
            clips.set(code, clip)
          }
          for (const rect of range.getClientRects()) {
            const left = Math.max(rect.left, clip.left)
            const right = Math.min(rect.right, clip.right)
            const top = Math.max(rect.top, clip.top)
            const bottom = Math.min(rect.bottom, clip.bottom)
            if (right <= left || bottom <= top) continue
            boxes.push({ left: left - host.left - node.clientLeft, right: right - host.left - node.clientLeft,
              top: top - host.top - node.clientTop, bottom: bottom - host.top - node.clientTop, active: selected })
          }
        }
      }
      const fragment = document.createDocumentFragment()
      for (const box of mergeOccurrenceBoxes(boxes)) {
        const mark = document.createElement("span")
        mark.className = `jello-symbol-outline${box.active ? " is-active" : ""}`
        Object.assign(mark.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.right - box.left}px`, height: `${box.bottom - box.top}px` })
        fragment.append(mark)
      }
      layer.append(fragment)
    }
  })
  createEffect(() => { peek.target(); peek.occurrences(); peek.definition(); refresh() })
  onCleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    observer.disconnect()
    for (const { root, layer } of roots.values()) { root.removeEventListener("scroll", schedule, true); layer.remove() }
    roots.clear()
  })
  return {
    // Keep overlays inside their file's stacking context, above the code but
    // below Pierre's sticky headers (z-index 1/2).
    css: `:host { position: relative; isolation: isolate; }
      .jello-symbol-outlines { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; }
      .jello-symbol-outline { position: absolute; box-sizing: border-box; border: 1px solid rgb(198 155 36 / 55%); border-radius: 3px; background: rgb(235 191 55 / 12%); }
      .jello-symbol-outline.is-active { border-color: rgb(198 155 36 / 75%); background: rgb(235 191 55 / 18%); }`,
    rendered(node: HTMLElement, path: string, phase: string) {
      const existing = roots.get(node)
      if (phase === "unmount") {
        if (existing) { existing.root.removeEventListener("scroll", schedule, true); existing.layer.remove() }
        observer.unobserve(node)
        roots.delete(node)
      } else if (existing) {
        existing.path = path
        if (existing.layer.parentNode !== existing.root) existing.root.append(existing.layer)
      }
      else {
        const root = node.shadowRoot ?? node
        const layer = document.createElement("div")
        layer.className = "jello-symbol-outlines"
        layer.setAttribute("aria-hidden", "true")
        root.append(layer)
        root.addEventListener("scroll", schedule, true)
        observer.observe(node)
        roots.set(node, { path, root, layer })
      }
      refresh()
    },
  }
}

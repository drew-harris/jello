import { CodeView, type TokenEventBase } from "@pierre/diffs"
import { createEffect, on, onCleanup, onMount } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { createOccurrenceHighlights } from "./highlights"
import { isSelectedOccurrence, sourceToken, tokenPosition } from "./position"
import type { FileViewModel } from "./file-model"
import { sourceItem, sourceScrollTarget } from "./file-rendering"
import { gutterCSS, paintGutter } from "./file-changes"

export function FileCode(props: { model: FileViewModel; theme?: string; wrap: boolean; menu(x: number, y: number): void }) {
  const ctx = usePlugin()
  let container!: HTMLDivElement
  const viewer = new CodeView()
  const gutterRoots = new Set<HTMLElement>()
  const paint = (node: HTMLElement) => paintGutter(node.shadowRoot ?? node, props.model.changes()?.markers ?? [])
  createEffect(() => {
    props.model.changes()
    for (const node of gutterRoots) paint(node)
  })
  const highlights = createOccurrenceHighlights({
    target: () => props.model.target() ?? props.model.location(),
    occurrences: props.model.occurrences,
    definition: () => props.model.target() ? undefined : props.model.location(),
  })
  const choose = (token: TokenEventBase, event: MouseEvent) => {
    const document = props.model.document()
    if (!document) return
    const position = tokenPosition(document.path, token, event)
    if (!position) return
    const previous = props.model.target()
    if (previous?.path === position.path && previous.line === position.line && previous.character === position.character) return position
    void props.model.choose(position)
    return position
  }
  onMount(() => viewer.setup(container))
  createEffect(on([() => props.theme, () => props.wrap, () => ctx.appearance.mode()], () => {
    viewer.setOptions({
      theme: props.theme ?? { light: "github-light", dark: "github-dark" },
      themeType: ctx.appearance.mode(),
      overflow: props.wrap ? "wrap" : "scroll",
      disableFileHeader: true,
      enableLineSelection: true,
      enableGutterUtility: false,
      itemMetrics: { lineHeight: 22, spacing: 0 },
      layout: { paddingTop: 8, paddingBottom: 16, gap: 0 },
      tokenizeMaxLineLength: 10_000,
      onTokenClick(token, event) {
        event.stopPropagation()
        const document = props.model.document()
        const position = document && tokenPosition(document.path, token, event)
        if (!event.metaKey && !event.ctrlKey && position && isSelectedOccurrence(props.model.target(), props.model.occurrences(), position)) {
          props.model.clearSymbol()
          return
        }
        if (choose(token, event) && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          void props.model.query(event.shiftKey ? "references" : "definition")
        }
      },
      unsafeCSS: `${highlights.css}\n${gutterCSS}\n:host { --diffs-font-family: var(--jello-file-font, monospace); --diffs-font-size: 12px; --diffs-line-height: 22px; }
        :host(:focus-visible), [data-code]:focus-visible, pre:focus-visible { outline: none; box-shadow: none; }`,
      onPostRender(node, _instance, phase) {
        if (phase === "unmount") gutterRoots.delete(node)
        else { gutterRoots.add(node); paint(node) }
        const path = props.model.document()?.path
        if (path) highlights.rendered(node, path, phase)
        node.oncontextmenu = phase === "unmount" ? null : (event) => {
          const token = sourceToken(event)
          if (!token || !choose(token, event)) return
          event.preventDefault()
          event.stopPropagation()
          props.menu(event.clientX, event.clientY)
        }
      },
    })
  }))
  let version = 0
  createEffect(on(props.model.document, (document) => {
    viewer.setItems(document ? [sourceItem(document, ++version)] : [])
  }))
  createEffect(on(props.model.navigation, () => {
    const document = props.model.document()
    const location = props.model.location()
    if (!document || !location) return
    viewer.scrollTo(sourceScrollTarget(document, location))
  }))
  onCleanup(() => { viewer.cleanUp(); gutterRoots.clear() })
  return <div ref={container} class="jello-file-code" role="region" tabindex={0} aria-label="Entire source file"
    style={{ "--jello-file-font": ctx.appearance.font("mono") }} />
}

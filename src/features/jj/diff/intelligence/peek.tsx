import { createEffect, createMemo, createSignal, For, onCleanup, Show, type Accessor } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import type { DiffTokenEventBaseProps } from "@pierre/diffs"
import { Intelligence, type PeekKind, type PeekLocation, type PeekResult, type PeekSource, type SymbolPosition } from "./rpc"
import { contextToken, isSelectedOccurrence, tokenPosition } from "./position"
import { errorMessage } from "../../errors"
import { SymbolContextMenu } from "./context-menu"
import { PeekCode } from "./preview-code"
import { localDefinition } from "./jump"

export function createCodePeek(session: Accessor<MountedSession>, revision: Accessor<string>, current: Accessor<boolean>) {
  const [target, setTarget] = createSignal<SymbolPosition>()
  const [definition, setDefinition] = createSignal<PeekLocation>()
  const jumps = new Set<(location: PeekLocation, signal: AbortSignal) => boolean | Promise<boolean>>()
  const registerDefinitionJump = (jump: (location: PeekLocation, signal: AbortSignal) => boolean | Promise<boolean>) => {
    jumps.add(jump)
    return () => { jumps.delete(jump) }
  }
  const [menu, setMenu] = createSignal<{ x: number; y: number }>()
  let menuReturnFocus: HTMLElement | undefined
  let symbolElement: HTMLElement | undefined
  let targetSide: DiffTokenEventBaseProps["side"] | undefined
  const closeMenu = (restoreFocus = false) => {
    setMenu(undefined)
    if (restoreFocus && menuReturnFocus?.isConnected) menuReturnFocus.focus({ preventScroll: true })
  }
  const [unavailable, setUnavailable] = createSignal("")
  const [kind, setKind] = createSignal<PeekKind>("definition")
  const [opened, setOpened] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal("")
  const [result, setResult] = createSignal<PeekResult>()
  const [selected, setSelected] = createSignal(0)
  const [source, setSource] = createSignal<PeekSource>()
  const [sourceLoading, setSourceLoading] = createSignal(false)
  const [sourceError, setSourceError] = createSignal("")
  const [occurrences, setOccurrences] = createSignal<PeekLocation[]>([])
  const [highlightLoading, setHighlightLoading] = createSignal(false)
  const [highlightError, setHighlightError] = createSignal("")
  let highlightController: AbortController | undefined
  let highlightGeneration = 0
  const clearHighlights = () => {
    highlightGeneration++
    highlightController?.abort()
    setOccurrences([])
    setHighlightLoading(false)
    setHighlightError("")
  }
  let lookupController: AbortController | undefined
  let sourceController: AbortController | undefined
  let returnFocus: HTMLElement | undefined
  let generation = 0
  let sourceGeneration = 0
  const cancel = () => {
    generation++
    sourceGeneration++
    lookupController?.abort()
    sourceController?.abort()
    setLoading(false)
    setSourceLoading(false)
  }
  const close = () => {
    cancel()
    setOpened(false)
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
  }
  // Polling replaces result objects even when the commit is unchanged. Memoize
  // the primitive identity so those refreshes never dismiss an active peek.
  const identity = createMemo(() => JSON.stringify([revision(), session().server.id, session().directory, current()]))
  createEffect(() => {
    identity()
    cancel()
    clearHighlights()
    setOpened(false)
    setTarget(undefined)
    setDefinition(undefined)
    setMenu(undefined)
    targetSide = undefined
    setUnavailable("")
  })
  onCleanup(() => { cancel(); clearHighlights() })
  const highlight = async (position: SymbolPosition) => {
    clearHighlights()
    const request = highlightGeneration
    const controller = highlightController = new AbortController()
    // Paint the clicked identifier immediately, even during cold project startup.
    setOccurrences([{ path: position.path, line: position.line, character: position.character,
      endLine: position.line, endCharacter: position.character + position.text.length }])
    setHighlightLoading(true)
    try {
      const data = await session().server.client.rpc(Intelligence).lookup({ directory: session().directory,
        path: position.path, line: position.line, character: position.character, expectedLine: position.expectedLine,
        kind: "documentHighlight" }, { signal: controller.signal }) as PeekResult
      if (request === highlightGeneration) setOccurrences(data.locations)
    } catch (error) {
      if (request === highlightGeneration && !controller.signal.aborted) setHighlightError(errorMessage(error))
    } finally { if (request === highlightGeneration) setHighlightLoading(false) }
  }
  const location = () => result()?.locations[selected()]
  const select = async (index: number) => {
    sourceController?.abort()
    const request = ++sourceGeneration
    const controller = sourceController = new AbortController()
    setSelected(index)
    setSource(undefined)
    setSourceError("")
    const item = location()
    if (!item) return
    setSourceLoading(true)
    try {
      const value = await session().server.client.rpc(Intelligence).source({ directory: session().directory, path: item.path, line: item.line }, { signal: controller.signal }) as PeekSource
      if (request === sourceGeneration) setSource(value)
    } catch (error) {
      if (request === sourceGeneration && !controller.signal.aborted) setSourceError(errorMessage(error))
    } finally { if (request === sourceGeneration) setSourceLoading(false) }
  }
  const open = async (value: PeekKind) => {
    if (menu()) closeMenu(true)
    const position = target()
    if (!position || unavailable()) return
    if (!opened()) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    cancel()
    const request = generation
    const controller = lookupController = new AbortController()
    setKind(value)
    setOpened(value === "references")
    setLoading(true)
    setError("")
    setResult(undefined)
    setSource(undefined)
    setSourceError("")
    try {
      const data = await session().server.client.rpc(Intelligence).lookup({ directory: session().directory,
        path: position.path, line: position.line, character: position.character, expectedLine: position.expectedLine, kind: value }, { signal: controller.signal }) as PeekResult
      if (request !== generation) return
      setResult(data)
      const destination = localDefinition(value, data)
      if (destination) {
        setDefinition(destination)
        for (const jump of jumps) {
          const moved = await jump({ ...destination, path: position.path }, controller.signal)
          if (request !== generation) return
          if (moved) { setOpened(false); return }
        }
      }
      setOpened(true)
      if (data.locations.length) void select(0)
    } catch (error) {
      if (request === generation && !controller.signal.aborted) { setError(errorMessage(error)); setOpened(true) }
    } finally { if (request === generation) setLoading(false) }
  }
  const deselect = () => {
    cancel()
    clearHighlights()
    setOpened(false)
    setMenu(undefined)
    setTarget(undefined)
    setDefinition(undefined)
    setUnavailable("")
    targetSide = undefined
  }
  const choose = (position: SymbolPosition, token: DiffTokenEventBaseProps) => {
    cancel()
    setOpened(false)
    setMenu(undefined)
    setTarget(position)
    setDefinition(undefined)
    targetSide = token.side
    symbolElement = token.tokenElement
    const unsupported = !current() || token.side === "deletions"
    setUnavailable(unsupported ? "Peeks and symbol highlights are available on the working-copy (right/additions) side only." : "")
    if (unsupported) clearHighlights()
    else void highlight(position)
  }
  const click = (path: string, token: DiffTokenEventBaseProps, event: MouseEvent) => {
    const position = tokenPosition(path, token, event)
    if (!position) return
    if (!event.metaKey && !event.ctrlKey && token.side === targetSide && isSelectedOccurrence(target(), occurrences(), position)) {
      deselect()
      return
    }
    choose(position, token)
    if (event.metaKey || event.ctrlKey) { event.preventDefault(); void open(event.shiftKey ? "references" : "definition") }
  }
  const contextmenu = (path: string, event: MouseEvent) => {
    const token = contextToken(event)
    if (!token) return
    const position = tokenPosition(path, token, event)
    if (!position) return
    event.preventDefault()
    event.stopPropagation()
    if (token.side !== targetSide || target()?.line !== position.line || target()?.character !== position.character || target()?.path !== path) choose(position, token)
    menuReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    setMenu({ x: event.clientX, y: event.clientY })
  }
  const keydown = (event: KeyboardEvent) => {
    if ((event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) && target()) {
      event.preventDefault()
      event.stopPropagation()
      const rect = symbolElement?.isConnected ? symbolElement.getBoundingClientRect() : undefined
      menuReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
      setMenu({ x: rect?.left ?? 16, y: rect?.bottom ?? 16 })
      return
    }
    if (event.key === "Escape" && opened()) { event.preventDefault(); event.stopPropagation(); close(); return }
    if (event.key === "Escape" && target()) {
      event.preventDefault()
      event.stopPropagation()
      deselect()
      return
    }
    if (event.key !== "F12" || !target() || unavailable() || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    event.stopPropagation()
    void open(event.shiftKey ? "references" : "definition")
  }
  return { target, unavailable, kind, opened, loading, error, result, selected, source, sourceLoading, sourceError, location, select, open, close, click, keydown,
    menu, closeMenu, contextmenu, definition, registerDefinitionJump,
    occurrences, highlightLoading, highlightError }
}

export type CodePeek = ReturnType<typeof createCodePeek>

export function PeekContextMenu(props: { peek: CodePeek }) {
  return <>
    <Show keyed when={props.peek.menu()}>{(menu) => <SymbolContextMenu x={menu.x} y={menu.y}
      symbol={props.peek.target()?.text ?? "Symbol"} disabledReason={props.peek.unavailable()}
      close={props.peek.closeMenu} open={(kind) => void props.peek.open(kind)} />}</Show>
    <Show when={props.peek.highlightLoading() || props.peek.highlightError() || (props.peek.loading() && !props.peek.opened())}>
      <span class="jello-jj-symbol-status" role="status" title={props.peek.highlightError()}>
        {props.peek.loading() && !props.peek.opened() ? "Finding definition…" : props.peek.highlightLoading() ? "Finding occurrences…" : "Could not highlight occurrences"}
      </span>
    </Show>
  </>
}

export function CodePeekPanel(props: { peek: CodePeek; directory: string }) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const displayPath = (path: string) => path.startsWith(`${props.directory}/`) ? path.slice(props.directory.length + 1) : path
  let body!: HTMLDivElement
  createEffect(() => {
    props.peek.source()
    props.peek.location()
    const frame = requestAnimationFrame(() => {
      const line = body?.querySelector<HTMLElement>(".is-target")
      if (line) body.scrollTop = Math.max(0, line.offsetTop - body.offsetTop - 40)
    })
    onCleanup(() => cancelAnimationFrame(frame))
  })
  return <Show when={props.peek.opened()}>
    <section class="jello-jj-peek" aria-label={`Peek ${props.peek.kind()}`} onKeyDown={props.peek.keydown}>
      <header>
        <strong>{props.peek.kind() === "definition" ? "Definition" : "References"}: {props.peek.target()?.text}</strong>
        <span>{props.peek.result()?.locations.length}{props.peek.result()?.truncated ? "+ (limited to 500)" : ""}</span>
        <Show when={props.peek.result()?.locations.length === 1 && props.peek.location()}>{(location) =>
          <span class="jello-jj-peek-path" title={location().path}>{displayPath(location().path)}:{location().line + 1}</span>
        }</Show>
        <span class="jello-jj-peek-spacer" />
        <button type="button" onClick={() => void props.peek.open(props.peek.kind())} disabled={props.peek.loading()}>{props.peek.error() ? "Retry" : "Refresh"}</button>
        <ui.IconButton icon="close" label="Close peek (Escape)" onClick={props.peek.close} />
      </header>
      <Show when={props.peek.loading()}><p role="status">Looking up {props.peek.kind()}… First lookup may take a moment while TypeScript loads the project.</p></Show>
      <Show when={props.peek.error()}><p role="alert">{props.peek.error()}</p></Show>
      <Show when={props.peek.result()}>{(result) => <Show when={result().locations.length} fallback={<p role="status">No {props.peek.kind() === "definition" ? "definition" : "references"} found.</p>}>
        <div class="jello-jj-peek-body">
          <Show when={result().locations.length > 1}><nav aria-label="Peek results"><For each={result().locations}>{(location, index) =>
            <button type="button" classList={{ "is-selected": index() === props.peek.selected() }}
              aria-current={index() === props.peek.selected() ? "true" : undefined} title={location.path}
              onClick={() => void props.peek.select(index())}>
              {displayPath(location.path)}<span>:{location.line + 1}:{location.character + 1}</span>
            </button>
          }</For></nav></Show>
          <div class="jello-jj-peek-code" ref={body} tabindex={0} aria-label="Source preview" style={{ "font-family": ctx.appearance.font("mono") }}>
            <Show when={props.peek.sourceLoading()}><p role="status">Loading source…</p></Show>
            <Show when={props.peek.sourceError()}><p role="alert">{props.peek.sourceError()} <button type="button" onClick={() => void props.peek.select(props.peek.selected())}>Retry</button></p></Show>
            <Show when={props.peek.source()}>{(source) => <Show when={props.peek.location()}>{(location) =>
              <PeekCode source={source()} location={location()} />
            }</Show>}</Show>
          </div>
        </div>
      </Show>}</Show>
    </section>
  </Show>
}

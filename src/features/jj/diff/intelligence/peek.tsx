import { createEffect, createMemo, createSignal, onCleanup, Show, type Accessor } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import type { DiffTokenEventBaseProps } from "@pierre/diffs"
import { Intelligence, type PeekKind, type PeekLocation, type PeekResult, type SymbolPosition } from "../../../intelligence/rpc"
import { contextToken, isSelectedOccurrence, tokenPosition } from "./position"
import { errorMessage } from "../../../../shared/errors"
import { SymbolContextMenu } from "../../../intelligence/context-menu"
import { CodePeekPanel as PeekPanel } from "../../../intelligence/peek-panel"
import { localDefinition } from "./jump"
import { createLanguageRestart } from "../../../intelligence/restart"
import { createLanguageClient } from "../../../intelligence/client"
import { createFileChangeProvider } from "./file-changes"
import { fileStart } from "../file-open"

function restoreDiffFocus(element: HTMLElement | undefined) {
  // CodeView makes its scroll canvas focusable. Returning keyboard focus to
  // that clipped canvas produces a browser-sized ring around the entire diff.
  // Keep real controls as focus targets; route canvas focus to the panel instead.
  const control = element?.matches("button, a, input, textarea, select, [contenteditable=true]")
  const panel = !control ? element?.closest<HTMLElement>(".jello-jj-diff") : undefined
  const target = panel ?? element
  if (target?.isConnected) target.focus({ preventScroll: true })
}

export function createCodePeek(session: Accessor<MountedSession>, revision: Accessor<string>, current: Accessor<boolean>) {
  const ctx = usePlugin()
  const client = createLanguageClient(session)
  const fileChanges = createFileChangeProvider(session)
  const languageRestart = createLanguageRestart(ctx)
  const restarting = languageRestart.pending
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
    if (restoreFocus) restoreDiffFocus(menuReturnFocus)
  }
  const [unavailable, setUnavailable] = createSignal("")
  const [kind, setKind] = createSignal<PeekKind>("definition")
  const [opened, setOpened] = createSignal(false)
  const [source, setSource] = createSignal<string>()
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal("")
  const [result, setResult] = createSignal<PeekResult>()
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
  let returnFocus: HTMLElement | undefined
  let generation = 0
  const cancel = () => {
    generation++
    lookupController?.abort()
    setLoading(false)
  }
  const close = () => {
    cancel()
    setOpened(false)
    restoreDiffFocus(returnFocus)
  }
  // Polling replaces result objects even when the commit is unchanged. Memoize
  // the primitive identity so those refreshes never dismiss an active peek.
  const identity = createMemo(() => JSON.stringify([revision(), session().server.id, session().directory, current()]))
  createEffect(() => {
    identity()
    cancel()
    clearHighlights()
    setOpened(false)
    setSource(undefined)
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
      const data = await client.lookup(position, "documentHighlight", controller.signal)
      if (request === highlightGeneration) setOccurrences(data.locations)
    } catch (error) {
      if (request === highlightGeneration && !controller.signal.aborted) setHighlightError(errorMessage(error))
    } finally { if (request === highlightGeneration) setHighlightLoading(false) }
  }
  const open = async (value: PeekKind) => {
    if (menu()) closeMenu(true)
    const position = target()
    if (!position || unavailable()) return
    if (!opened()) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    cancel()
    setSource(undefined)
    const request = generation
    const controller = lookupController = new AbortController()
    setKind(value)
    setOpened(value === "references")
    setLoading(true)
    setError("")
    setResult(undefined)
    try {
      const data = await client.lookup(position, value, controller.signal)
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
    } catch (error) {
      if (request === generation && !controller.signal.aborted) { setError(errorMessage(error)); setOpened(true) }
    } finally { if (request === generation) setLoading(false) }
  }
  const openFile = (path: string) => {
    if (!opened()) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    cancel()
    clearHighlights()
    setMenu(undefined)
    setTarget(undefined)
    setDefinition(undefined)
    setUnavailable("")
    setError("")
    setSource(path)
    // File browsing does not need a selected symbol or a running language server.
    setResult({ locations: [fileStart(session().directory, path)], truncated: false })
    setOpened(true)
  }
  const deselect = () => {
    cancel()
    clearHighlights()
    setOpened(false)
    setSource(undefined)
    setMenu(undefined)
    setTarget(undefined)
    setDefinition(undefined)
    setUnavailable("")
    targetSide = undefined
    setResult(undefined)
    setError("")
  }
  // A palette action or another panel/window may restart this workspace's LSP.
  // Invalidate generations as well as visuals so old responses cannot reappear.
  createEffect(() => {
    const client = session().server.client
    const directory = session().directory
    const unsubscribe = client.rpc(Intelligence).events.on("restarted", (event) => {
      const data = event.data as { directory: string; root: string }
      if (data.directory === directory || data.root === directory) deselect()
    })
    onCleanup(unsubscribe)
  })
  const restart = async () => {
    if (restarting()) return
    closeMenu(true)
    deselect()
    await languageRestart.run(session())
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
    if ((event.metaKey || event.ctrlKey) && !unavailable()) {
      void open("references")
      return
    }
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
  return { client, fileChanges, source, openFile, target, unavailable, kind, opened, loading, error, result, open, close, click, keydown,
    menu, closeMenu, contextmenu, definition, registerDefinitionJump, restart, restarting,
    occurrences, highlightLoading, highlightError }
}

export type CodePeek = ReturnType<typeof createCodePeek>

export function PeekContextMenu(props: { peek: CodePeek }) {
  const ctx = usePlugin()
  const copyError = async () => {
    try {
      await ctx.system.copy(props.peek.highlightError())
      ctx.toast.show({ title: "Copied language-server error", variant: "success", duration: 2000 })
    } catch (error) {
      ctx.toast.show({ title: "Could not copy error", description: errorMessage(error), variant: "error" })
    }
  }
  return <>
    <Show keyed when={props.peek.menu()}>{(menu) => <SymbolContextMenu x={menu.x} y={menu.y}
      symbol={props.peek.target()?.text ?? "Symbol"} disabledReason={props.peek.unavailable()}
      restart={() => void props.peek.restart()} restarting={props.peek.restarting()}
      close={props.peek.closeMenu} open={(kind) => void props.peek.open(kind)} />}</Show>
    <Show when={props.peek.highlightError()} fallback={
      <Show when={props.peek.highlightLoading() || (props.peek.loading() && !props.peek.opened())}>
        <span class="jello-jj-symbol-status" role="status">
          {props.peek.loading() && !props.peek.opened() ? "Finding definition…" : "Finding occurrences…"}
        </span>
      </Show>
    }>{(error) => <div class="jello-jj-symbol-status is-error" role="alert">
      <strong>Could not highlight occurrences</strong>
      <pre>{error()}</pre>
      <button type="button" onClick={() => void copyError()}>Copy error</button>
      <button type="button" disabled={props.peek.restarting()} onClick={() => void props.peek.restart()}>Restart TypeScript language server</button>
    </div>}</Show>
  </>
}

export function CodePeekPanel(props: { peek: CodePeek; directory: string }) {
  const ctx = usePlugin()
  return <PeekPanel peek={props.peek} directory={props.directory} theme={`jello-jj-${ctx.appearance.mode()}`} />
}

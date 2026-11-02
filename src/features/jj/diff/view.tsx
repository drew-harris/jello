import { FileDiff, type FileDiffMetadata } from "@pierre/diffs"
import { batch, createEffect, createMemo, createSignal, ErrorBoundary, For, on, onCleanup, Show, Suspense } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import type { RevisionDiff } from "./server"
import { parseDiffTabID, type DiffTabRevision } from "./tab"
import { errorMessage } from "../errors"
import { buildFileTree, type FileTreeNode } from "./tree"
import { DiffIcon, FileIcon } from "./icons"
import { diffThemeCSS } from "./theme"
import { revisionAge } from "./time"
import { diffScrollAmount } from "./shortcuts"
import { MultiFileDiff } from "./multi-file"
import { createDiffScroller } from "./scroll"
import { normalizeDiffFontSize, type definition } from "../../../gui/definition"
import type { ViewModels } from "../view-models"
import { diffSessionKey } from "./navigation"
import { createDiffModel, type DiffModel } from "./state"

const fileKind = (file: FileDiffMetadata) => ({ new: "A", deleted: "D", "rename-pure": "R", "rename-changed": "R", change: "M" })[file.type]
const count = (file: FileDiffMetadata, kind: "additionLines" | "deletionLines") => file.hunks.reduce((total, hunk) => total + hunk[kind], 0)

interface DiffResult {
  id: string
  data?: RevisionDiff
  files: FileDiffMetadata[]
  error?: string
  refreshError: string
}

function DiffFile(props: { file: FileDiffMetadata; layout: "unified" | "split"; wrap: boolean }) {
  const ctx = usePlugin<typeof definition>()
  let container!: HTMLDivElement
  const viewer = new FileDiff()
  const fontSize = () => normalizeDiffFontSize(ctx.stores.jjDiff.value.fontSize)
  const lineHeight = () => fontSize() + 10
  createEffect(() => {
    const dark = ctx.appearance.mode() === "dark"
    viewer.setOptions({
      diffStyle: props.layout,
      theme: { light: "jello-jj-light", dark: "jello-jj-dark" },
      themeType: ctx.appearance.mode(),
      overflow: props.wrap ? "wrap" : "scroll",
      diffIndicators: "bars",
      lineDiffType: "word-alt",
      hunkSeparators: "line-info-basic",
      disableFileHeader: true,
      unsafeCSS: diffThemeCSS(dark),
    })
    viewer.render({ fileDiff: props.file, containerWrapper: container })
  })
  onCleanup(() => { viewer.cleanUp(); container.replaceChildren() })
  return <div class="jello-jj-diff-renderer" style={{ "--diffs-font-family": ctx.appearance.font("mono"),
    "--diffs-font-size": `${fontSize()}px`, "--diffs-line-height": `${lineHeight()}px` }} ref={container} />
}

function TreeEntry(props: {
  node: FileTreeNode
  files: FileDiffMetadata[]
  selected: number
  filtering: boolean
  depth: number
  select(index: number): void
}) {
  const [expanded, setExpanded] = createSignal(true)
  const file = () => props.node.index === undefined ? undefined : props.files[props.node.index]
  return <li>
    <Show when={file()} fallback={<>
      <button type="button" class="jello-jj-diff-tree-row is-folder" style={{ "padding-left": `${10 + props.depth * 16}px` }}
        aria-expanded={expanded() || props.filtering} onClick={() => setExpanded(!expanded())}>
        <DiffIcon name="chevron" class={expanded() || props.filtering ? "is-expanded" : ""} />
        <span>{props.node.name}</span>
      </button>
      <Show when={expanded() || props.filtering}>
        <ul><For each={props.node.children}>{(node) => <TreeEntry node={node} files={props.files} selected={props.selected}
          filtering={props.filtering} depth={props.depth + 1} select={props.select} />}</For></ul>
      </Show>
    </>}>
      {(file) => <button type="button" class="jello-jj-diff-tree-row" classList={{ "is-selected": props.selected === props.node.index }}
        style={{ "padding-left": `${10 + props.depth * 16}px` }} aria-current={props.selected === props.node.index ? "true" : undefined}
        title={file().prevName ? `${file().prevName} → ${file().name}` : file().name} onClick={() => props.select(props.node.index!)}>
        <FileIcon name={file().name} />
        <span class="jello-jj-diff-file-name">{props.node.name}</span>
        <span class="jello-jj-diff-file-kind" data-kind={fileKind(file())}>{fileKind(file())}</span>
      </button>}
    </Show>
  </li>
}

interface DiffViewProps {
  session: MountedSession
  tabID: string
  models: ViewModels<DiffModel>
  focusRevision?: number
  requestedFile?: string
  onRevision?(id: string, revision: DiffTabRevision): void
}

export function DiffView(props: DiffViewProps) {
  const ctx = usePlugin()
  const ui = ctx.ui
  let panel!: HTMLElement
  // Wait for the host's tab-opening frame before taking keyboard focus. Only
  // opening/selecting a tab triggers this, never polling or renderer updates.
  createEffect(on([() => props.tabID, () => props.focusRevision], () => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (document.hidden || !panel.isConnected || !panel.getClientRects().length || ctx.dialogs.active()) return
        if (ctx.layout.state(`${ctx.id}:${props.tabID}`, props.session) !== "visible") return
        if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
      })
    })
    onCleanup(() => cancelAnimationFrame(frame))
  }))
  const scroller = createDiffScroller({
    now: () => performance.now(),
    frame: (callback) => requestAnimationFrame(callback),
    cancel: (frame) => cancelAnimationFrame(frame),
    reducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  })
  const release = (event: KeyboardEvent) => scroller.release(event.key)
  const stop = () => scroller.stop()
  const visibility = () => { if (document.hidden) stop() }
  window.addEventListener("keyup", release)
  window.addEventListener("blur", stop)
  document.addEventListener("visibilitychange", visibility)
  onCleanup(() => {
    stop()
    window.removeEventListener("keyup", release)
    window.removeEventListener("blur", stop)
    document.removeEventListener("visibilitychange", visibility)
  })
  createEffect(() => { if (ctx.dialogs.active()) stop() })
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || ctx.dialogs.active() || !panel.contains(document.activeElement)) return
    // Pierre's renderer uses shadow DOM. Check the composed path as well as
    // the retargeted element so editing/copying inside it retains native keys.
    if (event.composedPath().some((node) => node instanceof HTMLElement
      && (node.isContentEditable || node.matches("input, textarea, select, [role=textbox]")))) return
    const content = panel.querySelector<HTMLElement>(".jello-jj-diff-content")
    if (!content) return
    const amount = diffScrollAmount(event, content.clientHeight)
    if (amount === undefined) return
    event.preventDefault()
    event.stopPropagation()
    scroller.start(`${event.ctrlKey ? "ctrl+" : ""}${event.key}`, amount, content)
  }
  // Boundaries must precede resource/memo creation to avoid suspending the window.
  return <section ref={panel} class="jello-jj-diff" aria-label="JJ revision diff" data-mode={ctx.appearance.mode()}
    tabIndex={0} onKeyDown={onKeyDown} onWheel={stop} onTouchStart={stop}
    onFocusOut={(event) => { if (!(event.relatedTarget instanceof Node) || !panel.contains(event.relatedTarget)) stop() }}
    onPointerDown={(event) => {
      stop()
      if (event.composedPath().some((node) => node instanceof HTMLElement
        && (node.isContentEditable || node.matches("button, a, input, textarea, select, [tabindex]")) && node !== panel)) return
      panel.focus({ preventScroll: true })
    }}>
    <ErrorBoundary fallback={(error, reset) => <div class="jello-jj-diff-empty" role="alert">
    <p>{errorMessage(error)}</p><ui.Button onClick={reset}>Retry</ui.Button>
  </div>}>
    <Suspense fallback={<div class="jello-jj-diff-empty" role="status">Loading revision diff…</div>}>
      <Show keyed when={`${diffSessionKey(props.session)}\0${props.tabID}`}>
        {(key) => <DiffContents session={props.session} tabID={props.tabID} models={props.models} modelKey={key}
          focusRevision={props.focusRevision} requestedFile={props.requestedFile} onRevision={props.onRevision} />}
      </Show>
    </Suspense>
    </ErrorBoundary>
  </section>
}

function DiffContents(props: DiffViewProps & { modelKey: string }) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const model = props.models.use(props.modelKey, () => createDiffModel(props.tabID))
  const preferences = ctx.stores.jjDiff
  const layout = () => preferences.value.layout
  const setLayout = (value: "unified" | "split") => preferences.update((draft) => { draft.layout = value })
  const multiFile = () => preferences.value.multiFile
  const setMultiFile = (value: boolean) => preferences.update((draft) => { draft.multiFile = value })
  const [navigation, setNavigation] = createSignal(0)
  const wrap = () => preferences.value.wrap
  const setWrap = (value: boolean) => preferences.update((draft) => { draft.wrap = value })
  const sidebar = () => preferences.value.sidebar
  const setSidebar = (value: boolean) => preferences.update((draft) => { draft.sidebar = value })
  const { sidebarWidth, setSidebarWidth, selected, setSelected, query, setQuery } = model
  const [resizing, setResizing] = createSignal(false)
  let workspace!: HTMLDivElement
  let sidebarElement!: HTMLElement
  let drag: { pointerID: number; x: number; width: number } | undefined
  const resizeSidebar = (width: number) => {
    const available = workspace.getBoundingClientRect().width
    const minimum = Math.min(160, available * 0.4)
    setSidebarWidth(Math.round(Math.max(minimum, Math.min(width, available - 160))))
  }
  const selectFile = (index: number) => batch(() => {
    setSelected(index)
    setNavigation((value) => value + 1)
  })
  const [now, setNow] = createSignal(Date.now())
  const clock = setInterval(() => setNow(Date.now()), 60_000)
  onCleanup(() => clearInterval(clock))
  // createLatest never suspends and retains the last successful result. Both
  // the request and navigation signals outlive this mounted panel.
  const loading = () => model.result.loading
  const result = createMemo<DiffResult | undefined>(() => {
    const latest = model.result.latest
    const error = model.result.error ? errorMessage(model.result.error) : ""
    if (!latest && !error) return undefined
    return { id: props.tabID, data: latest?.data, files: latest?.files ?? [],
      error: latest ? undefined : error, refreshError: latest ? error : "" }
  })
  const [slowRefresh, setSlowRefresh] = createSignal(false)
  let disposed = false
  let poll: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    clearTimeout(poll)
    if (!disposed && result()?.data?.revision.current) poll = setTimeout(() => refresh(), model.nextDelay())
  }
  createEffect(on(loading, (pending) => {
    setSlowRefresh(false)
    if (pending) {
      clearTimeout(poll)
      const timer = setTimeout(() => setSlowRefresh(true), 3_000)
      onCleanup(() => clearTimeout(timer))
    } else schedule()
  }))
  const refetch = model.refresh
  createEffect(() => model.configure(props.session.server.client))
  createEffect(() => {
    const revision = model.result.latest?.data.revision
    if (revision) props.onRevision?.(props.tabID, revision)
  })
  createEffect(on([() => props.tabID, () => props.focusRevision, () => props.requestedFile], () => {
    const target = parseDiffTabID(props.tabID)
    const path = props.requestedFile ?? target?.file
    if (!path) return
    model.selectPath(path)
    setNavigation((value) => value + 1)
    setQuery("")
  }))
  const active = () => result()?.id === props.tabID ? result() : undefined
  const files = createMemo(() => active()?.files ?? [])
  const refresh = (force = false) => {
    if (loading()) return
    if (document.hidden || !workspace?.isConnected || !workspace.getClientRects().length) { schedule(); return }
    // Coalesce focus/tab/visibility events with polling, including error backoff.
    if (!force && Date.now() - model.lastFinished() < model.nextDelay()) { schedule(); return }
    if (force || active()?.data?.revision.current) refetch()
  }
  const onFocus = () => refresh()
  window.addEventListener("focus", onFocus)
  document.addEventListener("visibilitychange", onFocus)
  onCleanup(() => {
    disposed = true
    clearTimeout(poll)
    window.removeEventListener("focus", onFocus)
    document.removeEventListener("visibilitychange", onFocus)
  })
  createEffect(on(() => props.focusRevision, () => {
    // The host makes a cached tab visible after its focus callback.
    const frame = requestAnimationFrame(() => refresh(!active()?.data?.revision.current))
    onCleanup(() => cancelAnimationFrame(frame))
  }))
  const file = () => files()[selected()]
  const tree = createMemo(() => buildFileTree(files(), query()))
  const totals = createMemo(() => files().reduce((total, file) => ({ added: total.added + count(file, "additionLines"), deleted: total.deleted + count(file, "deletionLines") }), { added: 0, deleted: 0 }))

  return <div class="jello-jj-diff-stage" aria-busy={loading()}>
    <Show when={active()?.data || !loading()} fallback={<div class="jello-jj-diff-empty" role="status">Loading revision diff…</div>}>
      <Show when={!active()?.error} fallback={<div class="jello-jj-diff-empty" role="alert"><p>{active()?.error}</p><button type="button" onClick={() => void refetch()}>Retry</button></div>}>
        <header class="jello-jj-diff-revision" aria-label="Revision details">
          <div class="jello-jj-diff-revision-meta">
            <button type="button" class="jello-jj-diff-change-id" title="Copy change ID" aria-label="Copy change ID"
              onClick={async () => {
                const id = active()?.data?.revision.changeID8
                if (!id) return
                try {
                  await ctx.system.copy(id)
                  ctx.toast.show({ title: "Copied to clipboard", variant: "success", duration: 2000 })
                } catch (error) {
                  ctx.toast.show({ title: "Could not copy change ID", description: errorMessage(error), variant: "error" })
                }
              }}>
              <strong>{active()?.data?.revision.changeID8.slice(0, active()?.data?.revision.changeID.length)}</strong>
              <span>{active()?.data?.revision.changeID8.slice(active()?.data?.revision.changeID.length)}</span>
            </button>
            <Show when={active()?.data?.revision.current}>
              <span class="jello-jj-diff-working-copy" title="Working copy — automatically refreshes while visible">@ working copy</span>
            </Show>
            <time dateTime={active()?.data?.revision.timestamp} title={active()?.data?.revision.timestamp}>
              {revisionAge(active()?.data?.revision.timestamp ?? "", now())}
            </time>
            <span class="jello-jj-diff-refresh-status" role="status" classList={{ "is-refreshing": slowRefresh() }}>
              {slowRefresh() ? "Refreshing…" : ""}
            </span>
            <span class="jello-jj-diff-totals">
              <span class="jello-jj-diff-added">+{totals().added}</span>
              <span class="jello-jj-diff-deleted">−{totals().deleted}</span>
            </span>
          </div>
          <div class="jello-jj-diff-commit-message">{active()?.data?.revision.description || "No description"}</div>
        </header>
        <Show when={active()?.refreshError}><div class="jello-jj-diff-refresh-error" role="alert">
          Could not refresh: {active()?.refreshError} <button type="button" disabled={loading()} onClick={() => refresh(true)}>Retry</button>
        </div></Show>
        <div class="jello-jj-diff-workspace" ref={workspace} classList={{ "is-resizing": resizing() }}>
          <Show when={sidebar()}>
            <aside class="jello-jj-diff-sidebar" ref={sidebarElement} style={{ width: `${sidebarWidth()}px` }}>
              <div class="jello-jj-diff-filter-row">
                <label class="jello-jj-diff-filter"><DiffIcon name="search" />
                  <input type="search" aria-label="Filter changed files" placeholder="Filter files" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
                </label>
                <button type="button" class="jello-jj-diff-heading-icon" title="Hide file tree" aria-label="Hide file tree"
                  aria-expanded={sidebar()} onClick={() => setSidebar(false)}><DiffIcon name="tree" /></button>
              </div>
              <nav class="jello-jj-diff-files" aria-label="Changed files"><ul>
                <For each={tree()}>{(node) => <TreeEntry node={node} files={files()} selected={selected()} filtering={!!query()} depth={0} select={selectFile} />}</For>
              </ul><Show when={!tree().length}><p class="jello-jj-diff-muted">{files().length ? "No matching files" : "No file changes"}</p></Show></nav>
            </aside>
            <div class="jello-jj-diff-resize-handle" role="separator" tabindex={0}
              aria-label="Resize file tree" aria-orientation="vertical" aria-valuenow={sidebarWidth()}
              title="Drag to resize file tree; double-click to reset"
              onPointerDown={(event) => {
                if (event.button !== 0 || drag) return
                event.preventDefault()
                drag = { pointerID: event.pointerId, x: event.clientX, width: sidebarElement.getBoundingClientRect().width }
                event.currentTarget.setPointerCapture(event.pointerId)
                setResizing(true)
              }}
              onPointerMove={(event) => {
                if (drag?.pointerID === event.pointerId) resizeSidebar(drag.width + event.clientX - drag.x)
              }}
              onPointerUp={(event) => {
                if (drag?.pointerID === event.pointerId) event.currentTarget.releasePointerCapture(event.pointerId)
              }}
              onLostPointerCapture={() => { drag = undefined; setResizing(false) }}
              onDblClick={() => resizeSidebar(240)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
                event.preventDefault()
                event.stopPropagation()
                resizeSidebar(sidebarElement.getBoundingClientRect().width + (event.key === "ArrowLeft" ? -16 : 16))
              }} />
          </Show>
          <div class="jello-jj-diff-main">
            <div class="jello-jj-diff-toolbar">
              <Show when={!sidebar()}>
                <button type="button" class="jello-jj-diff-icon-button" title="Show file tree" aria-label="Show file tree"
                  aria-expanded={sidebar()} onClick={() => setSidebar(true)}><DiffIcon name="tree" /></button>
              </Show>
              <button type="button" class="jello-jj-diff-icon-button" title="Previous file" aria-label="Previous file" disabled={selected() <= 0} onClick={() => selectFile(selected() - 1)}><DiffIcon name="previous" /></button>
              <button type="button" class="jello-jj-diff-icon-button" title="Next file" aria-label="Next file" disabled={selected() >= files().length - 1} onClick={() => selectFile(selected() + 1)}><DiffIcon name="next" /></button>
              <span class="jello-jj-diff-toolbar-spacer" />
              <button type="button" class="jello-jj-diff-icon-button" title="Refresh diff" aria-label="Refresh diff"
                disabled={slowRefresh()} aria-disabled={loading()} onClick={refetch}><DiffIcon name="refresh" /></button>
              <button type="button" class="jello-jj-diff-icon-button" title="Wrap lines" aria-label="Wrap lines" aria-pressed={wrap()} onClick={() => setWrap(!wrap())}><DiffIcon name="wrap" /></button>
              <button type="button" class="jello-jj-diff-icon-button" title="Multi-file mode — stack all changed files" aria-label="Multi-file mode"
                aria-pressed={multiFile()} onClick={() => setMultiFile(!multiFile())}>
                <span aria-hidden="true"><ui.Icon name="bullet-list" size="small" /></span>
              </button>
              <div class="jello-jj-diff-layout" role="group" aria-label="Diff layout">
                <button type="button" title="Unified diff" aria-label="Unified diff" aria-pressed={layout() === "unified"} onClick={() => setLayout("unified")}><DiffIcon name="unified" /></button>
                <button type="button" title="Split diff" aria-label="Split diff" aria-pressed={layout() === "split"} onClick={() => setLayout("split")}><DiffIcon name="split" /></button>
              </div>
            </div>
            <Show when={multiFile() && files().length} fallback={
            <Show when={file()} fallback={<div class="jello-jj-diff-empty">{(props.requestedFile ?? parseDiffTabID(props.tabID)?.file) && files().length ? "The requested file was not found in this revision's diff. Use the file tree to choose another file." : "This revision has no file changes."}</div>}>{(file) => <>
              <header class="jello-jj-diff-file-heading" title={file().prevName ? `${file().prevName} → ${file().name}` : file().name}>
                <span class="jello-jj-diff-file-kind" data-kind={fileKind(file())}>{fileKind(file())}</span><FileIcon name={file().name} />
                <strong>{file().name.split("/").pop()}</strong><span class="jello-jj-diff-file-directory">{file().name.includes("/") ? file().name.slice(0, file().name.lastIndexOf("/") + 1) : ""}</span>
                <span class="jello-jj-diff-totals"><span class="jello-jj-diff-added">+{count(file(), "additionLines")}</span><span class="jello-jj-diff-deleted">−{count(file(), "deletionLines")}</span></span>
              </header>
              <div class="jello-jj-diff-content"><Show when={file().hunks.length} fallback={<div class="jello-jj-diff-empty">
                <p>{file().prevName ? `Renamed from ${file().prevName}. ` : ""}No text hunks (binary, rename, empty file, or mode-only change).</p>
                <Show when={file().prevMode !== file().mode}><p>Mode: {file().prevMode || "none"} → {file().mode || "none"}</p></Show>
              </div>}><DiffFile file={file()} layout={layout()} wrap={wrap()} /></Show></div>
            </>}</Show>
            }>
              <MultiFileDiff files={files()} layout={layout()} wrap={wrap()} selected={selected()} navigation={navigation()} select={setSelected} />
            </Show>
          </div>
        </div>
      </Show>
    </Show>
  </div>
}

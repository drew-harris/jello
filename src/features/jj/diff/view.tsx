import { FileDiff, parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs"
import { batch, createEffect, createMemo, createSignal, ErrorBoundary, For, on, onCleanup, Show, Suspense } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { Status } from "../rpc"
import type { RevisionDiff } from "./server"
import { diffFileIndex, parseDiffTabID } from "./tab"
import { errorMessage } from "../errors"
import { buildFileTree, type FileTreeNode } from "./tree"
import { DiffIcon, FileIcon } from "./icons"
import { diffThemeCSS } from "./theme"
import { revisionAge } from "./time"
import { DIFF_POLL_INTERVAL, diffPollDelay } from "./poll"
import { reuseDiffFiles } from "./files"

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
  const ctx = usePlugin()
  let container!: HTMLDivElement
  const viewer = new FileDiff()
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
  return <div class="jello-jj-diff-renderer" style={{ "--diffs-font-family": ctx.appearance.font("mono") }} ref={container} />
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

export function DiffView(props: { session: MountedSession; tabID: string; focusRevision?: number }) {
  const ctx = usePlugin()
  const ui = ctx.ui
  // Boundaries must precede resource/memo creation to avoid suspending the window.
  return <section class="jello-jj-diff" aria-label="JJ revision diff" data-mode={ctx.appearance.mode()}>
    <ErrorBoundary fallback={(error, reset) => <div class="jello-jj-diff-empty" role="alert">
    <p>{errorMessage(error)}</p><ui.Button onClick={reset}>Retry</ui.Button>
  </div>}>
    <Suspense fallback={<div class="jello-jj-diff-empty" role="status">Loading revision diff…</div>}>
      <DiffContents session={props.session} tabID={props.tabID} focusRevision={props.focusRevision} />
    </Suspense>
    </ErrorBoundary>
  </section>
}

function DiffContents(props: { session: MountedSession; tabID: string; focusRevision?: number }) {
  const ctx = usePlugin()
  const [layout, setLayout] = createSignal<"unified" | "split">("unified")
  const [wrap, setWrap] = createSignal(true)
  const [sidebar, setSidebar] = createSignal(!parseDiffTabID(props.tabID)?.file)
  const [sidebarWidth, setSidebarWidth] = createSignal(240)
  const [resizing, setResizing] = createSignal(false)
  let workspace!: HTMLDivElement
  let sidebarElement!: HTMLElement
  let drag: { pointerID: number; x: number; width: number } | undefined
  const resizeSidebar = (width: number) => {
    const available = workspace.getBoundingClientRect().width
    const minimum = Math.min(160, available * 0.4)
    setSidebarWidth(Math.round(Math.max(minimum, Math.min(width, available - 160))))
  }
  const [selected, setSelected] = createSignal(0)
  const [query, setQuery] = createSignal("")
  const [now, setNow] = createSignal(Date.now())
  const clock = setInterval(() => setNow(Date.now()), 60_000)
  onCleanup(() => clearInterval(clock))
  // Refreshes must not read a pending resource under the outer Suspense: that
  // replaces the entire panel with its loading fallback. Publish completed
  // results through signals instead, retaining the mounted view while fetching.
  const [result, setResult] = createSignal<DiffResult>()
  const [loading, setLoading] = createSignal(true)
  const [slowRefresh, setSlowRefresh] = createSignal(false)
  let slowRefreshTimer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let disposed = false
  let failures = 0
  let nextDelay = DIFF_POLL_INTERVAL
  let lastFinished = 0
  let poll: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    clearTimeout(poll)
    if (!disposed && result()?.data?.revision.current) poll = setTimeout(() => refresh(), nextDelay)
  }
  const load = async (id: string, client: MountedSession["server"]["client"]) => {
    const request = ++generation
    const started = Date.now()
    clearTimeout(poll)
    const previous = result()?.id === id ? result() : undefined
    clearTimeout(slowRefreshTimer)
    setSlowRefresh(false)
    slowRefreshTimer = setTimeout(() => {
      if (!disposed && request === generation) setSlowRefresh(true)
    }, 3_000)
    setLoading(true)
    try {
      const target = parseDiffTabID(id)
      if (!target) throw new Error("Invalid diff tab")
      const knownCommitID = previous?.data?.revision.commitID
      const update = await client.rpc(Status).diff({ directory: target.directory, commitID: knownCommitID ?? target.commitID,
        ...(knownCommitID ? { knownCommitID } : {}) }) as RevisionDiff
      if (disposed || request !== generation) return
      if (update.unchanged && !previous?.data) throw new Error("Missing cached diff. Refresh to load it again.")
      const data = update.unchanged ? { ...update, patch: previous!.data!.patch } : update
      const files = previous?.data?.patch === data.patch ? previous.files
        : reuseDiffFiles(previous?.files ?? [], parsePatchFiles(data.patch, `${target.directory}:${data.revision.commitID}`, true).flatMap((patch) => patch.files))
      const path = previous?.files[selected()]?.name
      const index = path ? diffFileIndex(files, path) : -1
      // Publish selection and data together so inserted files cannot briefly
      // display the wrong diff before selection is corrected in an effect.
      batch(() => {
        setSelected(index >= 0 ? index : diffFileIndex(files, target.file))
        setResult({ id, data, files, refreshError: "" })
      })
      failures = 0
    } catch (error) {
      if (disposed || request !== generation) return
      failures++
      setResult(previous?.data ? { ...previous, refreshError: errorMessage(error) }
        : { id, files: [], error: errorMessage(error), refreshError: "" })
    } finally {
      if (!disposed && request === generation) {
        clearTimeout(slowRefreshTimer)
        setSlowRefresh(false)
        lastFinished = Date.now()
        nextDelay = diffPollDelay(lastFinished - started, failures)
        setLoading(false)
        schedule()
      }
    }
  }
  const refetch = () => {
    if (!loading()) void load(props.tabID, props.session.server.client)
  }
  createEffect(on([() => props.tabID, () => props.session.server.client], ([id, client]) => {
    failures = 0
    void load(id, client)
  }))
  createEffect(on([() => props.tabID, () => parseDiffTabID(props.tabID)?.file ? props.focusRevision : 0], () => {
    const target = parseDiffTabID(props.tabID)
    if (target?.file) {
      // Reopening a file-targeted tab restores the clicked file and hidden tree,
      // even if the user navigated elsewhere in that tab in the meantime.
      setSidebar(false)
    }
    const loaded = result()
    if (loaded?.id !== props.tabID) return
    setSelected(diffFileIndex(loaded.files, target?.file))
    setQuery("")
  }))
  const active = () => result()?.id === props.tabID ? result() : undefined
  const files = createMemo(() => active()?.files ?? [])
  const refresh = (force = false) => {
    if (loading()) return
    if (document.hidden || !workspace?.isConnected || !workspace.getClientRects().length) { schedule(); return }
    // Coalesce focus/tab/visibility events with polling, including error backoff.
    if (!force && Date.now() - lastFinished < nextDelay) { schedule(); return }
    if (force || active()?.data?.revision.current) refetch()
  }
  const onFocus = () => refresh()
  window.addEventListener("focus", onFocus)
  document.addEventListener("visibilitychange", onFocus)
  onCleanup(() => {
    disposed = true
    generation++
    clearTimeout(slowRefreshTimer)
    clearTimeout(poll)
    window.removeEventListener("focus", onFocus)
    document.removeEventListener("visibilitychange", onFocus)
  })
  createEffect(on(() => props.focusRevision, () => {
    // The host makes a cached tab visible after its focus callback.
    const frame = requestAnimationFrame(() => refresh())
    onCleanup(() => cancelAnimationFrame(frame))
  }, { defer: true }))
  const file = () => files()[selected()]
  const tree = createMemo(() => buildFileTree(files(), query()))
  const totals = createMemo(() => files().reduce((total, file) => ({ added: total.added + count(file, "additionLines"), deleted: total.deleted + count(file, "deletionLines") }), { added: 0, deleted: 0 }))
  const revisionTitle = () => `${active()?.data?.revision.description || "No description"}\n${active()?.data?.revision.commitID || ""}`

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
              <header class="jello-jj-diff-sidebar-heading" title={revisionTitle()}>
                <button type="button" class="jello-jj-diff-heading-icon" title="Hide file tree" aria-label="Hide file tree"
                  aria-expanded={sidebar()} onClick={() => setSidebar(false)}><DiffIcon name="tree" /></button>
                <strong>JJ changes</strong><span class="jello-jj-diff-revision-id">{active()?.data?.revision.changeID}</span>
              </header>
              <label class="jello-jj-diff-filter"><DiffIcon name="search" />
                <input type="search" aria-label="Filter changed files" placeholder="Filter files" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
              </label>
              <nav class="jello-jj-diff-files" aria-label="Changed files"><ul>
                <For each={tree()}>{(node) => <TreeEntry node={node} files={files()} selected={selected()} filtering={!!query()} depth={0} select={setSelected} />}</For>
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
              <button type="button" class="jello-jj-diff-icon-button" title="Previous file" aria-label="Previous file" disabled={selected() <= 0} onClick={() => setSelected(selected() - 1)}><DiffIcon name="previous" /></button>
              <button type="button" class="jello-jj-diff-icon-button" title="Next file" aria-label="Next file" disabled={selected() >= files().length - 1} onClick={() => setSelected(selected() + 1)}><DiffIcon name="next" /></button>
              <span class="jello-jj-diff-toolbar-spacer" />
              <button type="button" class="jello-jj-diff-icon-button" title="Refresh diff" aria-label="Refresh diff"
                disabled={slowRefresh()} aria-disabled={loading()} onClick={refetch}><DiffIcon name="refresh" /></button>
              <button type="button" class="jello-jj-diff-icon-button" title="Wrap lines" aria-label="Wrap lines" aria-pressed={wrap()} onClick={() => setWrap(!wrap())}><DiffIcon name="wrap" /></button>
              <div class="jello-jj-diff-layout" role="group" aria-label="Diff layout">
                <button type="button" title="Unified diff" aria-label="Unified diff" aria-pressed={layout() === "unified"} onClick={() => setLayout("unified")}><DiffIcon name="unified" /></button>
                <button type="button" title="Split diff" aria-label="Split diff" aria-pressed={layout() === "split"} onClick={() => setLayout("split")}><DiffIcon name="split" /></button>
              </div>
            </div>
            <Show when={file()} fallback={<div class="jello-jj-diff-empty">{parseDiffTabID(props.tabID)?.file && files().length ? "The requested file was not found in this revision's diff. Use the file tree to choose another file." : "This revision has no file changes."}</div>}>{(file) => <>
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
          </div>
        </div>
      </Show>
    </Show>
  </div>
}

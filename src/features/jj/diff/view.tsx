import { FileDiff, parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs"
import { createEffect, createMemo, createResource, createSignal, ErrorBoundary, For, onCleanup, Show, Suspense } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { Status } from "../rpc"
import type { RevisionDiff } from "./server"
import { parseDiffTabID } from "./tab"
import { errorMessage } from "../errors"
import { buildFileTree, type FileTreeNode } from "./tree"
import { DiffIcon, FileIcon } from "./icons"
import { diffThemeCSS } from "./theme"

const fileKind = (file: FileDiffMetadata) => ({ new: "A", deleted: "D", "rename-pure": "R", "rename-changed": "R", change: "M" })[file.type]
const count = (file: FileDiffMetadata, kind: "additionLines" | "deletionLines") => file.hunks.reduce((total, hunk) => total + hunk[kind], 0)

function DiffFile(props: { file: FileDiffMetadata; layout: "unified" | "split"; wrap: boolean }) {
  const ctx = usePlugin()
  let container!: HTMLDivElement
  createEffect(() => {
    const dark = ctx.appearance.mode() === "dark"
    const viewer = new FileDiff({
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
    onCleanup(() => { viewer.cleanUp(); container.replaceChildren() })
  })
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

export function DiffView(props: { session: MountedSession; tabID: string }) {
  const ctx = usePlugin()
  const ui = ctx.ui
  // Boundaries must precede resource/memo creation to avoid suspending the window.
  return <section class="jello-jj-diff" aria-label="JJ revision diff" data-mode={ctx.appearance.mode()}>
    <ErrorBoundary fallback={(error, reset) => <div class="jello-jj-diff-empty" role="alert">
    <p>{errorMessage(error)}</p><ui.Button onClick={reset}>Retry</ui.Button>
  </div>}>
    <Suspense fallback={<div class="jello-jj-diff-empty" role="status">Loading revision diff…</div>}>
      <DiffContents session={props.session} tabID={props.tabID} />
    </Suspense>
    </ErrorBoundary>
  </section>
}

function DiffContents(props: { session: MountedSession; tabID: string }) {
  const [layout, setLayout] = createSignal<"unified" | "split">("unified")
  const [wrap, setWrap] = createSignal(true)
  const [sidebar, setSidebar] = createSignal(true)
  const [selected, setSelected] = createSignal(0)
  const [query, setQuery] = createSignal("")
  const [result, { refetch }] = createResource(
    () => ({ id: props.tabID, client: props.session.server.client }),
    async ({ id, client }) => {
      try {
        const target = parseDiffTabID(id)
        if (!target) throw new Error("Invalid diff tab")
        const data = await client.rpc(Status).diff(target) as RevisionDiff
        const files = parsePatchFiles(data.patch, `${target.directory}:${target.commitID}`, true).flatMap((patch) => patch.files)
        return { id, data, files, error: undefined }
      } catch (error) {
        return { id, data: undefined, files: [] as FileDiffMetadata[], error: errorMessage(error) }
      }
    },
  )
  createEffect(() => { result(); setSelected(0); setQuery("") })
  const active = () => result()?.id === props.tabID ? result() : undefined
  const files = () => active()?.files ?? []
  const file = () => files()[selected()]
  const tree = createMemo(() => buildFileTree(files(), query()))
  const totals = createMemo(() => files().reduce((total, file) => ({ added: total.added + count(file, "additionLines"), deleted: total.deleted + count(file, "deletionLines") }), { added: 0, deleted: 0 }))
  const revisionTitle = () => `${active()?.data?.revision.description || "No description"}\n${active()?.data?.revision.commitID || ""}`

  return <div class="jello-jj-diff-stage">
    <Show when={!result.loading} fallback={<div class="jello-jj-diff-empty" role="status">Loading revision diff…</div>}>
      <Show when={!active()?.error} fallback={<div class="jello-jj-diff-empty" role="alert"><p>{active()?.error}</p><button type="button" onClick={() => void refetch()}>Retry</button></div>}>
        <div class="jello-jj-diff-workspace">
          <Show when={sidebar()}>
            <aside class="jello-jj-diff-sidebar">
              <header class="jello-jj-diff-sidebar-heading" title={revisionTitle()}>
                <button type="button" class="jello-jj-diff-heading-icon" title="Hide file tree" aria-label="Hide file tree"
                  aria-expanded={sidebar()} onClick={() => setSidebar(false)}><DiffIcon name="tree" /></button>
                <strong>JJ changes</strong><span class="jello-jj-diff-revision-id">{active()?.data?.revision.changeID}</span>
                <span class="jello-jj-diff-totals"><span class="jello-jj-diff-added">+{totals().added}</span><span class="jello-jj-diff-deleted">−{totals().deleted}</span></span>
              </header>
              <label class="jello-jj-diff-filter"><DiffIcon name="search" />
                <input type="search" aria-label="Filter changed files" placeholder="Filter files" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
              </label>
              <nav class="jello-jj-diff-files" aria-label="Changed files"><ul>
                <For each={tree()}>{(node) => <TreeEntry node={node} files={files()} selected={selected()} filtering={!!query()} depth={0} select={setSelected} />}</For>
              </ul><Show when={!tree().length}><p class="jello-jj-diff-muted">{files().length ? "No matching files" : "No file changes"}</p></Show></nav>
            </aside>
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
              <button type="button" class="jello-jj-diff-icon-button" title="Refresh diff" aria-label="Refresh diff" disabled={result.loading} onClick={() => void refetch()}><DiffIcon name="refresh" /></button>
              <button type="button" class="jello-jj-diff-icon-button" title="Wrap lines" aria-label="Wrap lines" aria-pressed={wrap()} onClick={() => setWrap(!wrap())}><DiffIcon name="wrap" /></button>
              <div class="jello-jj-diff-layout" role="group" aria-label="Diff layout">
                <button type="button" title="Unified diff" aria-label="Unified diff" aria-pressed={layout() === "unified"} onClick={() => setLayout("unified")}><DiffIcon name="unified" /></button>
                <button type="button" title="Split diff" aria-label="Split diff" aria-pressed={layout() === "split"} onClick={() => setLayout("split")}><DiffIcon name="split" /></button>
              </div>
            </div>
            <Show when={file()} keyed fallback={<div class="jello-jj-diff-empty">This revision has no file changes.</div>}>{(file) => <>
              <header class="jello-jj-diff-file-heading" title={file.prevName ? `${file.prevName} → ${file.name}` : file.name}>
                <span class="jello-jj-diff-file-kind" data-kind={fileKind(file)}>{fileKind(file)}</span><FileIcon name={file.name} />
                <strong>{file.name.split("/").pop()}</strong><span class="jello-jj-diff-file-directory">{file.name.includes("/") ? file.name.slice(0, file.name.lastIndexOf("/") + 1) : ""}</span>
                <span class="jello-jj-diff-totals"><span class="jello-jj-diff-added">+{count(file, "additionLines")}</span><span class="jello-jj-diff-deleted">−{count(file, "deletionLines")}</span></span>
              </header>
              <div class="jello-jj-diff-content"><Show when={file.hunks.length} fallback={<div class="jello-jj-diff-empty">
                <p>{file.prevName ? `Renamed from ${file.prevName}. ` : ""}No text hunks (binary, rename, empty file, or mode-only change).</p>
                <Show when={file.prevMode !== file.mode}><p>Mode: {file.prevMode || "none"} → {file.mode || "none"}</p></Show>
              </div>}><DiffFile file={file} layout={layout()} wrap={wrap()} /></Show></div>
            </>}</Show>
          </div>
        </div>
      </Show>
    </Show>
  </div>
}

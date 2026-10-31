import { FileDiff, parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs"
import { createEffect, createMemo, createResource, createSignal, ErrorBoundary, For, onCleanup, Show, Suspense } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { Status } from "../rpc"
import type { RevisionDiff } from "./server"
import { parseDiffTabID } from "./tab"
import { errorMessage } from "../errors"

function DiffFile(props: { file: FileDiffMetadata; layout: "unified" | "split"; wrap: boolean }) {
  const ctx = usePlugin()
  let container!: HTMLDivElement
  createEffect(() => {
    const viewer = new FileDiff({
      diffStyle: props.layout,
      theme: { light: "pierre-light", dark: "pierre-dark" },
      themeType: ctx.appearance.mode(),
      overflow: props.wrap ? "wrap" : "scroll",
      diffIndicators: "bars",
      lineDiffType: "word-alt",
      hunkSeparators: "line-info",
      // Do not inject CSS from repository data into the renderer.
    })
    viewer.render({ fileDiff: props.file, containerWrapper: container })
    onCleanup(() => {
      viewer.cleanUp()
      container.replaceChildren()
    })
  })
  return <div class="jello-jj-diff-renderer" ref={container} />
}

export function DiffView(props: { session: MountedSession; tabID: string }) {
  const ctx = usePlugin()
  const ui = ctx.ui
  // Establish boundaries before creating resources/memos, not just around their JSX.
  // Otherwise even an eager memo can suspend OpenCode's whole window.
  return <ErrorBoundary fallback={(error, reset) => <div class="jello-jj-diff-empty" role="alert">
    <p>{errorMessage(error)}</p>
    <ui.Button onClick={reset}>Retry</ui.Button>
  </div>}>
    <Suspense fallback={<section class="jello-jj-diff" aria-label="JJ revision diff">
      <div class="jello-jj-diff-empty" role="status">Loading revision diff…</div>
    </section>}>
      <DiffContents session={props.session} tabID={props.tabID} />
    </Suspense>
  </ErrorBoundary>
}

function DiffContents(props: { session: MountedSession; tabID: string }) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const [layout, setLayout] = createSignal<"unified" | "split">("unified")
  const [wrap, setWrap] = createSignal(false)
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
  createEffect(() => {
    result()
    setSelected(0)
    setQuery("")
  })
  const active = () => result()?.id === props.tabID ? result() : undefined
  const file = () => active()?.files[selected()]
  const filtered = createMemo(() => active()?.files.map((file, index) => ({ file, index }))
    .filter(({ file }) => `${file.name} ${file.prevName ?? ""}`.toLowerCase().includes(query().toLowerCase())) ?? [])
  const count = (file: FileDiffMetadata, kind: "additionCount" | "deletionCount") => file.hunks.reduce((total, hunk) => total + hunk[kind], 0)

  return (
    <section class="jello-jj-diff" aria-label="JJ revision diff" data-mode={ctx.appearance.mode()}>
      <header class="jello-jj-diff-heading">
        <div>
          <h2>JJ Diff <span>{active()?.data?.revision.changeID}</span></h2>
          <p title={active()?.data?.revision.description}>{active()?.data?.revision.description || "No description"}</p>
          <small title={parseDiffTabID(props.tabID)?.directory}>{active()?.data?.revision.commitID.slice(0, 12)} · Changes introduced by this revision</small>
        </div>
        <ui.Button size="small" busy={result.loading} onClick={() => void refetch()}>Refresh</ui.Button>
      </header>
      <Show when={!result.loading} fallback={<div class="jello-jj-diff-empty" role="status">Loading revision diff…</div>}>
        <Show when={!active()?.error} fallback={<div class="jello-jj-diff-empty" role="alert">{active()?.error}</div>}>
          <Show when={active()?.files.length} fallback={<div class="jello-jj-diff-empty">This revision has no file changes.</div>}>
            <div class="jello-jj-diff-toolbar">
              <span>{active()?.files.length} files</span>
              <div class="jello-jj-diff-layout" role="group" aria-label="Diff layout">
                <button type="button" aria-pressed={layout() === "unified"} onClick={() => setLayout("unified")}>Unified</button>
                <button type="button" aria-pressed={layout() === "split"} onClick={() => setLayout("split")}>Split</button>
              </div>
              <label><input type="checkbox" checked={wrap()} onChange={(event) => setWrap(event.currentTarget.checked)} /> Wrap lines</label>
            </div>
            <div class="jello-jj-diff-body">
              <nav class="jello-jj-diff-files" aria-label="Changed files">
                <input type="search" aria-label="Filter changed files" placeholder="Filter files…" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
                <For each={filtered()}>{({ file, index }) => (
                  <button type="button" classList={{ "is-selected": selected() === index }} aria-current={selected() === index ? "true" : undefined}
                    title={file.prevName ? `${file.prevName} → ${file.name}` : file.name} onClick={() => setSelected(index)}>
                    <span class="jello-jj-diff-file-kind">{{ new: "A", deleted: "D", "rename-pure": "R", "rename-changed": "R", change: "M" }[file.type]}</span>
                    <span class="jello-jj-diff-file-name">{file.name}</span>
                    <span class="jello-jj-diff-added">+{count(file, "additionCount")}</span>
                    <span class="jello-jj-diff-deleted">−{count(file, "deletionCount")}</span>
                  </button>
                )}</For>
                <Show when={!filtered().length}><p>No matching files.</p></Show>
              </nav>
              <main class="jello-jj-diff-content">
                <Show when={file()} keyed>{(file) => <>
                  <Show when={file.hunks.length} fallback={<div class="jello-jj-diff-empty">
                    <strong>{file.name}</strong>
                    <p>{file.prevName ? `Renamed from ${file.prevName}. ` : ""}No text hunks (binary, rename, empty file, or mode-only change).</p>
                    <Show when={file.prevMode !== file.mode}><p>Mode: {file.prevMode || "none"} → {file.mode || "none"}</p></Show>
                  </div>}>
                    <DiffFile file={file} layout={layout()} wrap={wrap()} />
                  </Show>
                </>}</Show>
              </main>
            </div>
          </Show>
        </Show>
      </Show>
    </section>
  )
}

import { createEffect, createMemo, createResource, createSignal, For, on, onCleanup, Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { Status } from "../rpc"
import { errorMessage } from "../errors"
import { diffTabID } from "../diff/tab"
import { revisionAge } from "../diff/time"
import { edgePath, graphRowID, laneX, layoutHistory, rowOffsets, ROW_HEIGHT } from "./layout"
import { changeIDLabel, type TreeCommit, type TreeHistory } from "./model"
import { ChangeContextMenu } from "./context-menu"
import { DescribeDialog } from "./describe-dialog"
import type { definition } from "../../../gui/definition"
import { RevisionFiles } from "./files"
import { BookmarkDialog } from "./bookmark-dialog"
import { treeShortcut } from "./shortcuts"

function ChangeID(props: { commit: TreeCommit }) {
  const label = () => changeIDLabel(props.commit)
  return <span class="jello-jj-tree-id" title={props.commit.changeID}>
    <strong>{label().prefix}</strong>{label().rest}
  </span>
}

export function TreeView(props: { session: MountedSession; revision: number; focusRequest: number; onChanged(): void }) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  let panel!: HTMLDivElement
  const [focused, setFocused] = createSignal(false)
  const [confirming, setConfirming] = createSignal(false)
  const state = () => ctx.stores.jjTree(props.session)
  const saved = () => {
    const value = state().value
    return value?.directory === props.session.directory ? value : undefined
  }
  // Selecting a row updates the same store, but must not trigger a history fetch.
  const limit = createMemo(() => saved()?.limit ?? 100)
  const setLimit = (update: (value: number) => number) => state().set({
    directory: props.session.directory,
    commitID: saved()?.commitID ?? "",
    changeID: saved()?.changeID ?? "",
    limit: update(limit()),
  })
  const selection = () => saved()
  const setSelection = (commit: { commitID: string; changeID: string }) => {
    state().set({
      directory: props.session.directory,
      commitID: commit.commitID,
      changeID: commit.changeID,
      limit: limit(),
    })
    const value = expansionState().value
    if (value?.directory === props.session.directory && value.changes.some((id) => id !== commit.changeID)) {
      expansionState().set({ directory: props.session.directory, changes: value.changes.filter((id) => id === commit.changeID) })
    }
  }
  const [abandoning, setAbandoning] = createSignal(false)
  const [creating, setCreating] = createSignal(false)
  const [editing, setEditing] = createSignal(false)
  const expansionState = () => ctx.stores.jjTreeExpanded(props.session)
  const expanded = createMemo(() => {
    const value = expansionState().value
    return new Set(value?.directory === props.session.directory ? value.changes : [])
  })
  const [rowHeights, setRowHeights] = createSignal<Record<string, number>>({})
  const toggleFiles = (changeID: string) => {
    const next = new Set(expanded())
    if (next.has(changeID)) next.delete(changeID)
    else next.add(changeID)
    expansionState().set({ directory: props.session.directory, changes: Array.from(next) })
  }
  const mutating = () => abandoning() || creating() || editing()
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; commit: TreeCommit; trigger: HTMLButtonElement }>()
  const buttons = new Map<string, HTMLButtonElement>()
  const [history, { refetch }] = createResource(
    () => ({ client: props.session.server.client, directory: props.session.directory, limit: limit(), revision: props.revision }),
    async ({ client, directory, limit }) => {
      try {
        return { data: await client.rpc(Status).tree({ directory, limit }) as TreeHistory, error: "" }
      } catch (error) {
        return { data: undefined, error: errorMessage(error) }
      }
    },
  )
  const commits = () => history.latest?.data?.commits ?? []
  const [graphState, setGraph] = createStore<ReturnType<typeof layoutHistory>>({ rows: [], lanes: 1 })
  // Retain keyed row/component identities when polling returns fresh objects.
  // This keeps expanded resources mounted and their existing file lists visible.
  createEffect(() => setGraph(reconcile(layoutHistory(commits()), { key: "id" })))
  const graph = () => graphState
  const selected = () => {
    const previous = selection()
    const exact = commits().find((commit) => commit.commitID === previous?.commitID)
    // Rewrites change commit IDs. Only follow a change ID if it is unambiguous.
    const rewritten = previous ? commits().filter((commit) => commit.changeID === previous.changeID) : []
    return exact ?? (rewritten.length === 1 ? rewritten[0] : undefined)
      ?? commits().find((commit) => commit.current) ?? commits()[0]
  }
  const gutter = () => Math.max(42, graph().lanes * 18 + 24)
  const offsets = createMemo(() => rowOffsets(graph().rows.map((row) => row.commit), rowHeights()))
  const rowCenter = (index: number) => offsets()[index] + ROW_HEIGHT / 2
  const boundaryY = (index: number) => offsets()[index] + ROW_HEIGHT - 5
  const measureRow = (element: HTMLLIElement, commitID: string) => {
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize[0]?.blockSize ?? element.offsetHeight
      setRowHeights((previous) => (previous[commitID] ?? ROW_HEIGHT) === height ? previous : { ...previous, [commitID]: height })
    })
    observer.observe(element)
    onCleanup(() => observer.disconnect())
  }
  const root = (id: string) => /^0+$/.test(id)
  const refresh = () => { if (!history.loading && !mutating()) void refetch() }
  const onFocus = () => { if (!document.hidden) refresh() }
  const timer = setInterval(onFocus, 10_000)
  window.addEventListener("focus", onFocus)
  document.addEventListener("visibilitychange", onFocus)
  onCleanup(() => {
    clearInterval(timer)
    window.removeEventListener("focus", onFocus)
    document.removeEventListener("visibilitychange", onFocus)
  })
  const choose = (index: number, focus = false) => {
    const commit = commits()[index]
    if (!commit) return
    setSelection({ commitID: commit.commitID, changeID: commit.changeID })
    const button = buttons.get(graphRowID(commit))
    if (focus) button?.focus({ preventScroll: true })
    button?.scrollIntoView({ block: "nearest" })
  }
  const jump = () => choose(commits().findIndex((commit) => commit.current), true)
  // Runs after mounting/loading too, and repeats even if the tab was already open.
  createEffect(on(() => props.focusRequest, (request) => {
    if (!request) return
    const target = selected()
    if (target) choose(commits().findIndex((commit) => commit.commitID === target.commitID), true)
    else panel.focus({ preventScroll: true })
  }))
  const openDiff = () => {
    const commit = selected()
    if (!commit || root(commit.commitID)) return
    ctx.layout.open(`${ctx.id}:${diffTabID({ directory: props.session.directory, commitID: commit.commitID })}`, props.session, { tab: "select" })
  }
  const closeMenu = (restoreFocus = false) => {
    const trigger = contextMenu()?.trigger
    setContextMenu(undefined)
    if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true })
  }
  const abandonChange = async (target = contextMenu()?.commit, confirm = false) => {
    if (!target || target.immutable || root(target.commitID) || mutating()) return
    const directory = props.session.directory
    const client = props.session.server.client
    if (confirm) {
      if (confirming()) return
      setConfirming(true)
      try {
        if (!await ctx.dialogs.confirm({
          title: "Abandon change?",
          description: `Abandon ${target.changeID.slice(0, 8)} — ${target.description.split("\n")[0] || "No description"}?`,
          confirm: "Abandon", danger: true,
        })) return
      } finally {
        setConfirming(false)
      }
      if (mutating() || props.session.directory !== directory || props.session.server.client !== client) return
    }
    setAbandoning(true)
    closeMenu(true)
    const progress = ctx.toast.show({ variant: "loading", title: `Abandoning ${target.changeID.slice(0, 8)}…`, persistent: true })
    try {
      await client.rpc(Status).abandon({ directory, commitID: target.commitID })
      props.onChanged()
      ctx.toast.show({ variant: "success", title: "Change abandoned" })
    } catch (error) {
      ctx.toast.show({ variant: "error", title: "Could not abandon change", description: errorMessage(error) })
    } finally {
      progress.dismiss()
      setAbandoning(false)
    }
  }
  const describeChange = (target: TreeCommit | undefined) => {
    if (!target || target.immutable || root(target.commitID) || mutating()) return
    const directory = props.session.directory
    const client = props.session.server.client
    closeMenu(true)
    ctx.dialogs.open((dialog) => <DescribeDialog changeID={target.changeID} description={target.description}
      close={dialog.close} describe={async (message) => {
        await client.rpc(Status).describe({ directory, commitID: target.commitID, message })
        props.onChanged()
      }} />)
  }
  const editChange = async (target: TreeCommit) => {
    if (target.immutable || root(target.commitID) || mutating()) return
    const directory = props.session.directory
    const client = props.session.server.client
    setEditing(true)
    closeMenu(true)
    const progress = ctx.toast.show({ variant: "loading", title: `Switching to ${target.changeID.slice(0, 8)}…`, persistent: true })
    try {
      await client.rpc(Status).edit({ directory, commitID: target.commitID })
      props.onChanged()
      ctx.toast.show({ variant: "success", title: "Working copy switched to change" })
    } catch (error) {
      ctx.toast.show({ variant: "error", title: "Could not edit change", description: errorMessage(error) })
    } finally {
      progress.dismiss()
      setEditing(false)
    }
  }
  const bookmarkChange = (target: TreeCommit) => {
    if (mutating()) return
    const directory = props.session.directory
    const client = props.session.server.client
    closeMenu(true)
    ctx.dialogs.open((dialog) => <BookmarkDialog changeID={target.changeID} close={dialog.close}
      load={async () => await client.rpc(Status).bookmarks({ directory }) as string[]}
      save={async (name) => {
        await client.rpc(Status).setBookmark({ directory, commitID: target.commitID, name })
        props.onChanged()
      }} />)
  }

  const createChange = async (commitID?: string) => {
    if (mutating()) return
    const directory = props.session.directory
    const client = props.session.server.client
    setCreating(true)
    closeMenu()
    try {
      await client.rpc(Status).newChange({ directory, ...(commitID ? { commitID } : {}) })
      props.onChanged()
      ctx.toast.show({ variant: "success", title: "New change created" })
    } catch (error) {
      ctx.toast.show({ variant: "error", title: "Could not create change", description: errorMessage(error) })
    } finally {
      setCreating(false)
    }
  }

  const onShortcut = (event: KeyboardEvent) => {
    // Portaled menus/dialogs and editable controls must never drive the tree.
    if (event.defaultPrevented || !panel.contains(document.activeElement) || ctx.dialogs.active() || confirming() || contextMenu()) return
    if (!(event.target instanceof Element) || !panel.contains(event.target)
      || event.target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false]), [role=textbox]")) return
    const action = treeShortcut(event)
    const target = selected()
    if (!action || !target) return
    event.preventDefault()
    event.stopPropagation()
    const index = commits().findIndex((commit) => commit.commitID === target.commitID)
    if (action === "down" || action === "up") {
      choose(Math.max(0, Math.min(commits().length - 1, index + (action === "down" ? 1 : -1))), true)
    } else if (action === "new") void createChange(target.commitID)
    else if (action === "bookmark") bookmarkChange(target)
    else if (action === "abandon") void abandonChange(target, true)
    else if (action === "diff") openDiff()
    else if (action === "describe") describeChange(target)
    else if (!expanded().has(target.changeID)) {
      setSelection(target)
      toggleFiles(target.changeID)
    }
  }

  return <div ref={panel} class="jello-jj-tree-content" tabIndex={-1}
    onFocusIn={() => setFocused(true)}
    onFocusOut={(event) => setFocused(event.relatedTarget instanceof Node && panel.contains(event.relatedTarget))}
    onPointerDown={(event) => {
      if (event.target instanceof Element && !event.target.closest("button, a, input, textarea, select, [contenteditable]")) panel.focus({ preventScroll: true })
    }} onKeyDown={onShortcut}>
    <header class="jello-jj-tree-toolbar">
      <Show when={focused() && !ctx.dialogs.active() && !confirming() && !contextMenu()}>
        <span class="jello-jj-tree-keyboard" role="img" aria-label="Tree keyboard shortcuts active"
          title="Keyboard shortcuts active: j/k select, n new change, Shift+B set bookmark, l expand files, a abandon (confirmation), d diff, Enter describe">
          <span aria-hidden="true"><ui.Icon name="keyboard" size="small" /></span>
        </span>
      </Show>
      <div class="jello-jj-tree-heading" title={props.session.directory}>
        <strong>{props.session.directory.split(/[\\/]/).filter(Boolean).at(-1) || props.session.directory}</strong>
        <span>Revision history</span>
      </div>
      <button type="button" class="jello-jj-tree-tool" title="New change (jj new)" aria-label="New change"
        disabled={history.loading || mutating()} aria-busy={creating()} onClick={() => void createChange()}>+</button>
      <button type="button" class="jello-jj-tree-tool" title="Jump to working copy" aria-label="Jump to working copy" disabled={!commits().some((commit) => commit.current)} onClick={jump}>@</button>
      <button type="button" class="jello-jj-tree-tool" title="Refresh history" aria-label="Refresh history" disabled={history.loading || mutating()} onClick={refresh}>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M16 8a6 6 0 1 0 0 5M16 3v5h-5" />
        </svg>
      </button>
    </header>
    <Show when={history.latest?.error}>
      <div class="jello-jj-tree-empty" role="alert"><strong>History unavailable</strong><p>{history.latest?.error}</p><button type="button" onClick={refresh}>Retry</button></div>
    </Show>
    <Show when={history.loading && !history.latest}>
      <div class="jello-jj-tree-empty" role="status">Loading history…</div>
    </Show>
    <Show when={history.latest?.data}>
      <div class="jello-jj-tree-scroll" aria-busy={history.loading}>
        <Show when={commits().length} fallback={<div class="jello-jj-tree-empty">No revisions in the configured log view.</div>}>
          <div class="jello-jj-tree-history" style={{ "--tree-gutter": `${gutter()}px`, "--tree-row-height": `${ROW_HEIGHT}px`, "min-width": `${gutter() + 220}px` }}>
            <svg class="jello-jj-tree-graph" width={gutter()} height={offsets().at(-1) ?? 0} aria-hidden="true">
              <For each={graph().rows}>{(row, index) => <>
                <For each={row.edges}>{(edge) => <path class="jello-jj-tree-edge" data-color={edge.color}
                  classList={{ "is-missing": edge.missing }}
                  d={edge.missing ? `M ${laneX(edge.from)} ${rowCenter(index())} Q ${laneX(edge.to)} ${rowCenter(index()) + 5}, ${laneX(edge.to)} ${boundaryY(index())}` : edgePath(edge.from, edge.to, rowCenter(index()), offsets()[index() + 1] - offsets()[index()])} />}</For>
                <For each={row.edges.filter((edge) => edge.missing)}>{(edge) =>
                  <path class="jello-jj-tree-edge is-boundary" data-color={row.color}
                    d={`M ${laneX(edge.to) - 3} ${boundaryY(index())} h 6`} />
                }</For>
              </>}</For>
              <For each={graph().rows}>{(row, index) => <g class="jello-jj-tree-node" data-color={row.color} transform={`translate(${laneX(row.lane)}, ${rowCenter(index())})`}>
                <Show when={row.commit.current}>
                  <circle r="10" class="jello-jj-tree-halo" />
                </Show>
                <Show when={row.commit.immutable && !row.commit.current} fallback={<circle r={row.commit.current ? 4 : 4.5} classList={{ "is-current": row.commit.current }} />}>
                  <path d="M 0 -5.5 L 5.5 0 L 0 5.5 L -5.5 0 Z" class="is-immutable" />
                </Show>
              </g>}</For>
            </svg>
            <ol class="jello-jj-tree-rows" aria-label="Commits">
              <For each={graph().rows}>{(row, index) => <li ref={(element) => measureRow(element, row.id)}>
                <button type="button" class="jello-jj-tree-row" ref={(element) => {
                  const id = row.id
                  buttons.set(id, element)
                  onCleanup(() => buttons.delete(id))
                }} classList={{ "is-selected": selected()?.commitID === row.commit.commitID, "is-working": row.commit.current }}
                  tabIndex={selected()?.commitID === row.commit.commitID ? 0 : -1}
                  aria-pressed={selected()?.commitID === row.commit.commitID}
                  aria-haspopup="menu"
                  aria-expanded={expanded().has(row.commit.changeID)}
                  aria-current={row.commit.current ? "true" : undefined}
                  aria-label={`${row.commit.current ? "Working copy, " : ""}${row.commit.empty && !root(row.commit.commitID) ? "Empty change, " : ""}${row.commit.changeID}, ${root(row.commit.commitID) ? "Root" : row.commit.description.trim() || "No description"}${row.missingParents.length ? ", some ancestry not shown" : ""}`}
                  onClick={(event) => {
                    setSelection({ commitID: row.commit.commitID, changeID: row.commit.changeID })
                    if (event.metaKey) {
                      event.preventDefault()
                      if (event.shiftKey) describeChange(row.commit)
                      else toggleFiles(row.commit.changeID)
                    }
                  }}
                  onDblClick={(event) => { if (!event.metaKey) openDiff() }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setSelection({ commitID: row.commit.commitID, changeID: row.commit.changeID })
                    const bounds = event.currentTarget.getBoundingClientRect()
                    setContextMenu({
                      x: event.clientX || bounds.left + gutter(), y: event.clientY || bounds.top + ROW_HEIGHT,
                      commit: row.commit, trigger: event.currentTarget,
                    })
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                      event.preventDefault()
                      setSelection({ commitID: row.commit.commitID, changeID: row.commit.changeID })
                      const bounds = event.currentTarget.getBoundingClientRect()
                      setContextMenu({ x: bounds.left + gutter(), y: bounds.bottom, commit: row.commit, trigger: event.currentTarget })
                      return
                    }
                    const target = event.key === "ArrowDown" ? index() + 1 : event.key === "ArrowUp" ? index() - 1 : event.key === "Home" ? 0 : event.key === "End" ? commits().length - 1 : undefined
                    if (target !== undefined) { event.preventDefault(); choose(Math.max(0, Math.min(commits().length - 1, target)), true) }
                    if (event.key === "ArrowRight" && !expanded().has(row.commit.changeID)) { event.preventDefault(); toggleFiles(row.commit.changeID) }
                    if (event.key === "ArrowLeft" && expanded().has(row.commit.changeID)) { event.preventDefault(); toggleFiles(row.commit.changeID) }
                  }}>
                  <span class="jello-jj-tree-meta">
                    <ChangeID commit={row.commit} />
                    <Show when={row.commit.current}><span class="jello-jj-tree-current">@ working copy</span></Show>
                    <For each={row.commit.bookmarks}>{(bookmark) => <span class="jello-jj-tree-bookmark" title={bookmark}>{bookmark}</span>}</For>
                    <Show when={!root(row.commit.commitID)}>
                      <span class="jello-jj-tree-row-author" title={row.commit.author || "Unknown author"}>{row.commit.author || "Unknown author"}</span>
                    </Show>
                    <Show when={row.commit.conflict}><span class="jello-jj-tree-warning">Conflict</span></Show>
                    <Show when={row.commit.divergent}><span class="jello-jj-tree-warning">Divergent</span></Show>
                    <span class="jello-jj-tree-age" title={row.commit.timestamp}>{root(row.commit.commitID) ? "" : revisionAge(row.commit.timestamp)}</span>
                  </span>
                  <span class="jello-jj-tree-subject" title={row.commit.description.trim() || (root(row.commit.commitID) ? "Root" : "No description")}
                    classList={{ "is-placeholder": !row.commit.description.trim() && !root(row.commit.commitID) }}>
                    <Show when={row.commit.empty && !root(row.commit.commitID)}>
                      <span class="jello-jj-tree-empty-icon" title="Empty change — no file changes" aria-hidden="true"><ui.Icon name="cube" size="small" /></span>
                    </Show>
                    {root(row.commit.commitID) ? "Root" : row.commit.description.split("\n")[0] || "No description"}
                    <Show when={row.missingParents.length}><span class="jello-jj-tree-boundary" title="Parent revisions are outside this log view. Dashed edges end here; no ancestry is inferred.">···</span></Show>
                  </span>
                </button>
                <Show when={expanded().has(row.commit.changeID)}>
                  <RevisionFiles session={props.session} commitID={row.commit.commitID} />
                </Show>
              </li>}</For>
            </ol>
          </div>
        </Show>
        <footer class="jello-jj-tree-tail">
          <Show when={history.latest?.data?.hasMore} fallback={<span>End of log view</span>}>
            <button type="button" disabled={history.loading || limit() >= 2000} onClick={() => setLimit((value) => Math.min(2000, value + 100))}>
              {history.loading ? "Loading…" : limit() >= 2000 ? "Showing first 2,000 revisions" : "Load more revisions"}
            </button>
          </Show>
        </footer>
      </div>
    </Show>
    <Show keyed when={contextMenu()}>{(menu) => <ChangeContextMenu x={menu.x} y={menu.y}
      disabled={menu.commit.immutable || root(menu.commit.commitID) || mutating()}
      newDisabled={mutating()} newChange={() => void createChange(menu.commit.commitID)}
      setBookmark={() => bookmarkChange(menu.commit)}
      edit={() => void editChange(menu.commit)}
      close={closeMenu} abandon={() => void abandonChange()} describe={() => describeChange(menu.commit)} />}</Show>
  </div>
}

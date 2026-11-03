import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { Status } from "../rpc"
import { errorMessage } from "../../../shared/errors"
import { openRevisionDiff } from "../diff/navigation"
import { revisionAge } from "../diff/time"
import { edgePath, graphRowID, laneX, layoutHistory, rowOffsets, ROW_HEIGHT } from "./layout"
import { changeIDLabel, type TreeCommit } from "./model"
import { ChangeContextMenu } from "./context-menu"
import { DescribeDialog } from "./describe-dialog"
import type { definition } from "../../../gui/definition"
import { RevisionFiles } from "./files"
import { BookmarkDialog } from "./bookmark-dialog"
import { treeShortcut } from "./shortcuts"
import { SquashDialog } from "./squash-dialog"
import type { SquashDetails } from "./squash-model"
import { repositoryViewKey, type ViewModels } from "../../../shared/gui/view-models"
import { createHistoryModel, type HistoryModel, type RevisionFilesModel } from "./state"
import { createAsyncAction } from "../../../shared/gui/async-action"
import { createPolling } from "../../../shared/gui/poll"
import { observeRepository, repositoryServices, sessionRepository } from "../../../shared/gui/repository"
import { JJ_CHANGED } from "../invalidation"
import { createChangeActions } from "./actions"

function ChangeID(props: { commit: TreeCommit }) {
  const label = () => changeIDLabel(props.commit)
  return <span class="jello-jj-tree-id" title={props.commit.changeID}>
    <strong>{label().prefix}</strong>{label().rest}
  </span>
}

export function TreeView(props: { session: MountedSession; models: ViewModels<HistoryModel>; filesModels: ViewModels<RevisionFilesModel>; focusRequest: number }) {
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
  const repositories = repositoryServices(ctx)
  const repository = sessionRepository(props.session)
  const gate = repositories.gate(repository)
  const mutation = createAsyncAction({ toast: ctx.toast, gate })
  const creation = createAsyncAction({ toast: ctx.toast, gate })
  const changed = () => repositories.events.invalidate(repository, JJ_CHANGED)
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
  const mutating = gate.pending
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; commit: TreeCommit; trigger: HTMLButtonElement }>()
  const buttons = new Map<string, HTMLButtonElement>()
  const model = props.models.use(repositoryViewKey(props.session.server.id, props.session.directory),
    () => createHistoryModel(props.session.directory))
  const history = model.history
  const refetch = model.refresh
  createEffect(() => model.configure(props.session.server.client, limit(), 0))
  const visible = () => !document.hidden && !!panel?.isConnected && !!panel.getClientRects().length
  observeRepository(repositories.events, repository, ["jj.history", "jj.bookmarks"], () => model.invalidate({ defer: !visible() }))
  const commits = () => history.latest?.commits ?? []
  const [graphState, setGraph] = createStore<ReturnType<typeof layoutHistory>>({ rows: [], lanes: 1 })
  // Retain keyed row/component identities when polling returns fresh objects.
  // This keeps expanded resources mounted and their existing file lists visible.
  createEffect(() => {
    const active = document.activeElement
    const hadRowFocus = active instanceof HTMLElement && panel?.contains(active)
      && active.matches(".jello-jj-tree-row")
    setGraph(reconcile(layoutHistory(commits()), { key: "id" }))
    if (!hadRowFocus) return
    // Abandoning removes the focused button. Restore focus only after Solid has
    // reconciled the rows, and only if the user hasn't focused something else.
    const frame = requestAnimationFrame(() => {
      if (active.isConnected || !panel.isConnected || !panel.getClientRects().length || ctx.dialogs.active()) return
      if (document.activeElement !== document.body && document.activeElement !== panel) return
      const target = selected()
      const button = target && buttons.get(graphRowID(target))
      if (button?.isConnected) {
        button.focus({ preventScroll: true })
        button.scrollIntoView({ block: "nearest" })
      } else panel.focus({ preventScroll: true })
    })
    onCleanup(() => cancelAnimationFrame(frame))
  })
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
  createPolling({ loading: () => history.loading, enabled: () => !mutating(), visible,
    lastFinished: model.lastFinished, delay: model.nextDelay, stale: model.stale, refresh })
  const choose = (index: number, focus = false) => {
    const commit = commits()[index]
    if (!commit) return
    setSelection({ commitID: commit.commitID, changeID: commit.changeID })
    const button = buttons.get(graphRowID(commit))
    if (focus) button?.focus({ preventScroll: true })
    button?.scrollIntoView({ block: "nearest" })
  }
  const jump = () => choose(commits().findIndex((commit) => commit.current), true)
  // Opening the host pane and mounting its rows finish after this effect runs.
  // Wait for the host's opening frame before focusing, including on first load.
  createEffect(on(() => props.focusRequest, (request) => {
    if (!request) return
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (!panel.isConnected || !panel.getClientRects().length || ctx.dialogs.active()) return
        const target = selected()
        const button = target && buttons.get(graphRowID(target))
        if (button?.isConnected) {
          button.focus({ preventScroll: true })
          button.scrollIntoView({ block: "nearest" })
        } else panel.focus({ preventScroll: true })
      })
    })
    onCleanup(() => cancelAnimationFrame(frame))
  }))
  const openDiff = () => {
    const commit = selected()
    if (!commit || root(commit.commitID)) return
    openRevisionDiff(ctx, props.session, { directory: props.session.directory, commitID: commit.commitID, changeID: commit.changeID, divergent: commit.divergent })
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
    const commitID = target.commitID
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
    closeMenu(true)
    await mutation.run(async () => { await client.rpc(Status).abandon({ directory, commitID }) }, {
      progress: `Abandoning ${target.changeID.slice(0, 8)}…`, success: "Change abandoned", failure: "Could not abandon change", onSuccess: changed,
    })
  }
  const describeChange = (target: TreeCommit | undefined) => {
    if (!target || target.immutable || root(target.commitID) || mutating()) return
    const directory = props.session.directory
    const client = props.session.server.client
    const commitID = target.commitID
    closeMenu(true)
    ctx.dialogs.open((dialog) => <DescribeDialog changeID={target.changeID} description={target.description}
      close={dialog.close} describe={async (message) => {
        await mutation.run(async () => { await client.rpc(Status).describe({ directory, commitID, message }) }, { rethrow: true, onSuccess: changed })
      }} />)
  }
  const editChange = async (target: TreeCommit) => {
    if (target.immutable || root(target.commitID) || mutating()) return
    const directory = props.session.directory
    const client = props.session.server.client
    closeMenu(true)
    const commitID = target.commitID
    await mutation.run(async () => { await client.rpc(Status).edit({ directory, commitID }) }, {
      progress: `Switching to ${target.changeID.slice(0, 8)}…`, success: "Working copy switched to change", failure: "Could not edit change", onSuccess: changed,
    })
  }
  const bookmarkChange = (target: TreeCommit) => {
    if (mutating()) return
    const directory = props.session.directory
    const client = props.session.server.client
    const commitID = target.commitID
    closeMenu(true)
    ctx.dialogs.open((dialog) => <BookmarkDialog changeID={target.changeID} close={dialog.close}
      load={async () => await client.rpc(Status).bookmarks({ directory }) as string[]}
      save={async (name) => {
        await mutation.run(async () => { await client.rpc(Status).setBookmark({ directory, commitID, name }) }, { rethrow: true, onSuccess: changed })
      }} />)
  }

  const pushChange = async (target: TreeCommit) => {
    if (mutating() || root(target.commitID) || !target.bookmarks.length) return
    const directory = props.session.directory
    const client = props.session.server.client
    const commitID = target.commitID
    closeMenu(true)
    await mutation.run(async () => { await client.rpc(Status).gitPush({ directory, commitID }) }, {
      progress: "Pushing bookmarks to Git…", success: "Bookmarks pushed", failure: "Could not push bookmarks", onSuccess: changed,
    })
  }

  const squashChange = (target: TreeCommit) => {
    if (mutating()) return
    const directory = props.session.directory
    const client = props.session.server.client
    // Copy the exact source ID: polling may reconcile and mutate the row object.
    const commitID = target.commitID
    closeMenu(true)
    ctx.dialogs.open((dialog) => <SquashDialog changeID={target.changeID} close={dialog.close}
      load={async () => await client.rpc(Status).squashDetails({ directory, commitID }) as SquashDetails}
      save={async (parentID, message) => {
        await mutation.run(async () => {
          await client.rpc(Status).squashBelow({ directory, commitID, parentID, ...(message !== undefined ? { message } : {}) })
        }, { progress: "Squashing change into parent…", rethrow: true, onSuccess: changed })
      }} />)
  }

  const createChange = async (commitID?: string) => {
    if (mutating()) return
    const directory = props.session.directory
    const client = props.session.server.client
    closeMenu()
    await creation.run(async () => { await client.rpc(Status).newChange({ directory, ...(commitID ? { commitID } : {}) }) }, {
      success: "New change created", failure: "Could not create change", onSuccess: changed,
    })
  }

  const actions = createChangeActions({ busy: mutating, commits, run(id, target, source) {
    if (id === "new") return createChange(target.commitID)
    if (id === "edit") return editChange(target)
    if (id === "describe") return describeChange(target)
    if (id === "bookmark") return bookmarkChange(target)
    if (id === "squash") return squashChange(target)
    if (id === "push") return pushChange(target)
    return abandonChange(target, source === "keyboard")
  } })
  const onShortcut = (event: KeyboardEvent) => {
    // Portaled menus/dialogs and editable controls must never drive the tree.
    if (event.defaultPrevented || !panel.contains(document.activeElement) || ctx.dialogs.active() || confirming() || contextMenu()) return
    if (!(event.target instanceof Element) || !panel.contains(event.target)
      || event.target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false]), [role=textbox]")) return
    const action = treeShortcut(event)
    if (action === "refresh") {
      event.preventDefault()
      event.stopPropagation()
      refresh()
      return
    }
    const target = selected()
    if (!action || !target) return
    event.preventDefault()
    event.stopPropagation()
    const index = commits().findIndex((commit) => commit.commitID === target.commitID)
    if (action === "down" || action === "up") {
      choose(Math.max(0, Math.min(commits().length - 1, index + (action === "down" ? 1 : -1))), true)
    } else if (actions.some((item) => item.id === action)) void actions.find((item) => item.id === action)!.run(target, "keyboard")
    else if (action === "diff") openDiff()
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
      <span class="jello-jj-tree-keyboard-slot">
      <Show when={focused() && !ctx.dialogs.active() && !confirming() && !contextMenu()}>
        <span class="jello-jj-tree-keyboard" role="img" aria-label="Tree keyboard shortcuts active"
          title="Keyboard shortcuts active: j/k select, n new change, Shift+B set bookmark, l expand files, a abandon (confirmation), d diff, e edit, Enter describe, Shift+S squash below, r refresh">
          <span aria-hidden="true"><ui.Icon name="keyboard" size="small" /></span>
        </span>
      </Show>
      </span>
      <div class="jello-jj-tree-heading" title={props.session.directory}>
        <strong>{props.session.directory.split(/[\\/]/).filter(Boolean).at(-1) || props.session.directory}</strong>
        <span>Revision history</span>
      </div>
      <div class="jello-jj-tree-tools" role="group" aria-label="History actions">
      <button type="button" class="jello-jj-tree-tool" title="New change (jj new)" aria-label="New change"
        disabled={history.loading || mutating()} aria-busy={creation.pending()} onClick={() => void createChange()}>
        <span aria-hidden="true"><ui.Icon name="plus-small" size="small" /></span>
      </button>
      <button type="button" class="jello-jj-tree-tool is-working-copy" title="Jump to working copy" aria-label="Jump to working copy" disabled={!commits().some((commit) => commit.current)} onClick={jump}>@</button>
      <button type="button" class="jello-jj-tree-tool" title="Refresh history (r)" aria-label="Refresh history" disabled={history.loading || mutating()} onClick={refresh}>
        <span aria-hidden="true"><ui.Icon name="refresh" size="small" /></span>
      </button>
      </div>
    </header>
    <Show when={history.error}>
      <div class="jello-jj-tree-empty" role="alert"><strong>History unavailable</strong><p>{errorMessage(history.error)}</p><button type="button" onClick={refresh}>Retry</button></div>
    </Show>
    <Show when={history.loading && !history.latest}>
      <div class="jello-jj-tree-empty" role="status">Loading history…</div>
    </Show>
    <Show when={history.latest}>
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
                    <For each={row.commit.bookmarkLabels ?? row.commit.bookmarks}>{(bookmark) => <span class="jello-jj-tree-bookmark"
                      classList={{ "is-remote": row.commit.remoteBookmarkLabels?.includes(bookmark) }}
                      title={`Bookmark: ${bookmark}\nJJ notation: * differs from a tracked remote; @remote marks a remote bookmark; ?? marks a conflict.`}>
                      <span aria-hidden="true"><ui.Icon name="branch" size="small" /></span>
                      <span class="jello-jj-tree-bookmark-name">{bookmark}</span>
                    </span>}</For>
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
                  <RevisionFiles session={props.session} models={props.filesModels} commitID={row.commit.commitID} changeID={row.commit.changeID} divergent={row.commit.divergent} />
                </Show>
              </li>}</For>
            </ol>
          </div>
        </Show>
        <footer class="jello-jj-tree-tail">
          <Show when={history.latest?.hasMore} fallback={<span>End of log view</span>}>
            <button type="button" disabled={history.loading || limit() >= 2000} onClick={() => setLimit((value) => Math.min(2000, value + 100))}>
              {history.loading ? "Loading…" : limit() >= 2000 ? "Showing first 2,000 revisions" : "Load more revisions"}
            </button>
          </Show>
        </footer>
      </div>
    </Show>
    <Show keyed when={contextMenu()}>{(menu) => <ChangeContextMenu x={menu.x} y={menu.y}
      target={menu.commit} actions={actions} close={closeMenu} />}</Show>
  </div>
}

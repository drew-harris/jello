import { createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { Status } from "../rpc"
import { errorMessage } from "../errors"
import { diffTabID } from "../diff/tab"
import { revisionAge } from "../diff/time"
import { edgePath, laneX, layoutHistory, ROW_HEIGHT } from "./layout"
import { changeIDLabel, type TreeCommit, type TreeHistory } from "./model"
import { ChangeContextMenu } from "./context-menu"
import { DescribeDialog } from "./describe-dialog"

function ChangeID(props: { commit: TreeCommit }) {
  const label = () => changeIDLabel(props.commit)
  return <span class="jello-jj-tree-id" title={props.commit.changeID}>
    <strong>{label().prefix}</strong>{label().rest}
  </span>
}

export function TreeView(props: { session: MountedSession; revision: number; onChanged(): void }) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const [limit, setLimit] = createSignal(100)
  const [selection, setSelection] = createSignal<{ commitID: string; changeID: string }>()
  const [notice, setNotice] = createSignal("")
  const [abandoning, setAbandoning] = createSignal(false)
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
  const graph = createMemo(() => layoutHistory(commits()))
  const selected = () => {
    const previous = selection()
    const exact = commits().find((commit) => commit.commitID === previous?.commitID)
    // Rewrites change commit IDs. Only follow a change ID if it is unambiguous.
    const rewritten = previous ? commits().filter((commit) => commit.changeID === previous.changeID) : []
    return exact ?? (rewritten.length === 1 ? rewritten[0] : undefined)
      ?? commits().find((commit) => commit.current) ?? commits()[0]
  }
  const gutter = () => Math.max(42, graph().lanes * 18 + 24)
  const rowCenter = (index: number) => index * ROW_HEIGHT + ROW_HEIGHT / 2
  const boundaryY = (index: number) => (index + 1) * ROW_HEIGHT - 5
  const root = (id: string) => /^0+$/.test(id)
  const refresh = () => { if (!history.loading && !abandoning()) void refetch() }
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
    const button = buttons.get(commit.commitID)
    if (focus) button?.focus({ preventScroll: true })
    button?.scrollIntoView({ block: "nearest" })
  }
  const jump = () => choose(commits().findIndex((commit) => commit.current), true)
  const openDiff = () => {
    const commit = selected()
    if (!commit || root(commit.commitID)) return
    ctx.layout.open(`${ctx.id}:${diffTabID({ directory: props.session.directory, commitID: commit.commitID })}`, props.session, { tab: "select" })
  }
  const copy = async (value: string) => {
    try { await ctx.system.copy(value); setNotice("Copied to clipboard") }
    catch (error) { setNotice(errorMessage(error)) }
  }
  const closeMenu = (restoreFocus = false) => {
    const trigger = contextMenu()?.trigger
    setContextMenu(undefined)
    if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true })
  }
  const abandonChange = async () => {
    const target = contextMenu()?.commit
    if (!target || target.immutable || root(target.commitID) || abandoning()) return
    const directory = props.session.directory
    const client = props.session.server.client
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
  const describeChange = () => {
    const target = contextMenu()?.commit
    if (!target || target.immutable || root(target.commitID) || abandoning()) return
    const directory = props.session.directory
    const client = props.session.server.client
    closeMenu(true)
    ctx.dialogs.open((dialog) => <DescribeDialog changeID={target.changeID} description={target.description}
      close={dialog.close} describe={async (message) => {
        await client.rpc(Status).describe({ directory, commitID: target.commitID, message })
        props.onChanged()
      }} />)
  }

  return <>
    <header class="jello-jj-tree-toolbar">
      <div class="jello-jj-tree-heading" title={props.session.directory}>
        <strong>{props.session.directory.split(/[\\/]/).filter(Boolean).at(-1) || props.session.directory}</strong>
        <span>Revision history</span>
      </div>
      <button type="button" class="jello-jj-tree-tool" title="Jump to working copy" aria-label="Jump to working copy" disabled={!commits().some((commit) => commit.current)} onClick={jump}>@</button>
      <button type="button" class="jello-jj-tree-tool" title="Refresh history" aria-label="Refresh history" disabled={history.loading || abandoning()} onClick={refresh}>
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
            <svg class="jello-jj-tree-graph" width={gutter()} height={commits().length * ROW_HEIGHT} aria-hidden="true">
              <For each={graph().rows}>{(row, index) => <>
                <For each={row.edges}>{(edge) => <path class="jello-jj-tree-edge" data-color={edge.color}
                  classList={{ "is-missing": edge.missing }}
                  d={edge.missing ? `M ${laneX(edge.from)} ${rowCenter(index())} Q ${laneX(edge.to)} ${rowCenter(index()) + 5}, ${laneX(edge.to)} ${boundaryY(index())}` : edgePath(edge.from, edge.to, rowCenter(index()))} />}</For>
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
              <For each={graph().rows}>{(row, index) => <li>
                <button type="button" class="jello-jj-tree-row" ref={(element) => {
                  buttons.set(row.commit.commitID, element)
                  onCleanup(() => buttons.delete(row.commit.commitID))
                }} classList={{ "is-selected": selected()?.commitID === row.commit.commitID, "is-working": row.commit.current }}
                  tabIndex={selected()?.commitID === row.commit.commitID ? 0 : -1}
                  aria-pressed={selected()?.commitID === row.commit.commitID}
                  aria-haspopup="menu"
                  aria-expanded={contextMenu()?.commit.commitID === row.commit.commitID}
                  aria-current={row.commit.current ? "true" : undefined}
                  aria-label={`${row.commit.current ? "Working copy, " : ""}${row.commit.empty && !root(row.commit.commitID) ? "Empty change, " : ""}${row.commit.changeID}, ${root(row.commit.commitID) ? "Root" : row.commit.description.trim() || "No description"}${row.missingParents.length ? ", some ancestry not shown" : ""}`}
                  onClick={() => { setSelection({ commitID: row.commit.commitID, changeID: row.commit.changeID }); setNotice("") }}
                  onDblClick={openDiff}
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
                    if (event.key === "Enter") { event.preventDefault(); openDiff() }
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
      <Show when={selected()}>{(commit) => <aside class="jello-jj-tree-details" aria-label="Selected revision">
        <div class="jello-jj-tree-detail-heading"><ChangeID commit={commit()} />
          <span>{commit().current ? "Working copy" : commit().immutable ? "Immutable" : "Mutable"}</span>
          <button type="button" disabled={root(commit().commitID)} onClick={openDiff}>Open diff <span aria-hidden="true">↗</span></button>
        </div>
        <p class="jello-jj-tree-description">{root(commit().commitID) ? "Root commit" : commit().description.trim() || "No description"}</p>
        <div class="jello-jj-tree-author">{commit().author || "Unknown author"}<span title={commit().timestamp}>{root(commit().commitID) ? "" : new Date(commit().timestamp).toLocaleString()}</span></div>
        <div class="jello-jj-tree-detail-actions">
          <button type="button" onClick={() => void copy(commit().changeID)} title="Copy change ID">Copy change ID</button>
          <button type="button" onClick={() => void copy(commit().commitID)} title={commit().commitID}>{commit().commitID.slice(0, 12)}</button>
          <span role="status">{notice()}</span>
        </div>
      </aside>}</Show>
    </Show>
    <div class="jello-jj-tree-footnote"><span>{commits().length} revisions</span><span>↑ ↓ navigate · Enter opens diff</span></div>
    <Show keyed when={contextMenu()}>{(menu) => <ChangeContextMenu x={menu.x} y={menu.y}
      disabled={menu.commit.immutable || root(menu.commit.commitID) || abandoning()}
      close={closeMenu} abandon={() => void abandonChange()} describe={describeChange} />}</Show>
  </>
}

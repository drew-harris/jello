import { createSignal, For, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import type { FileViewModel } from "./file-model"
import { FileCode } from "./file-code"
import { FileQueryMenu } from "./file-query-menu"
import { navigationQueries, type FileQuery } from "./queries"
import { codeScrollAmount } from "../../shared/gui/scroll-shortcuts"

export function FileView(props: { model: FileViewModel; directory: string; theme?: string }) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const model = props.model
  let panel!: HTMLDivElement
  const [wrap, setWrap] = createSignal(false)
  const [menu, setMenu] = createSignal<{ x: number; y: number }>()
  const path = (value: string) => value.startsWith(`${props.directory}/`) ? value.slice(props.directory.length + 1) : value
  const closeMenu = (restore = false) => { setMenu(undefined); if (restore) panel.focus({ preventScroll: true }) }
  const run = (kind: FileQuery) => { closeMenu(true); void model.query(kind) }
  const queryDisabled = () => !model.target() || !model.canQuery()
  const listedResults = () => {
    const results = model.results()
    return results && (results.locations.length !== 1 || results.truncated) ? results : undefined
  }
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.composedPath().some((node) => node instanceof HTMLElement && node.matches("input, textarea, select, [contenteditable=true]"))) return
    let handled = true
    if (event.key === "F12" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (!queryDisabled()) run(event.shiftKey ? "references" : "definition")
    }
    else if (event.key === "K" && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && !queryDisabled()) run("hover")
    else if (event.altKey && event.key === "ArrowLeft") void model.back()
    else if (event.altKey && event.key === "ArrowRight") void model.forward()
    else if ((event.key === "ContextMenu" || event.shiftKey && event.key === "F10") && model.target()) {
      const bounds = panel.getBoundingClientRect()
      setMenu({ x: bounds.left + 16, y: bounds.top + 40 })
    } else if (event.key === "Escape") handled = model.escape() || event.repeat
    else {
      const viewport = panel.querySelector<HTMLElement>(".jello-file-code")
      const amount = viewport ? codeScrollAmount(event, viewport.clientHeight) : undefined
      if (viewport && amount !== undefined) viewport.scrollBy({ top: amount })
      else handled = false
    }
    if (handled) { event.preventDefault(); event.stopPropagation() }
  }
  return <div ref={panel} class="jello-file-view" data-mode={ctx.appearance.mode()} tabindex={0} aria-label="Source file view" aria-busy={model.loading()}
    onKeyDown={keydown} onPointerDown={(event) => {
      if (!event.composedPath().some((node) => node instanceof HTMLElement && node.matches("button, input, select, textarea"))) {
        const viewport = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && node.classList.contains("jello-file-code"))
        ;(viewport ?? panel).focus({ preventScroll: true })
      }
    }}>
    <div class="jello-file-toolbar" role="toolbar" aria-label="Source navigation">
      <ui.IconButton icon="arrow-left" label="Back (Escape / Alt+Left)" disabled={!model.canBack()} onClick={() => void model.back()} />
      <ui.IconButton icon="arrow-right" label="Forward (Alt+Right)" disabled={!model.canForward()} onClick={() => void model.forward()} />
      <span class="jello-file-path" title={model.location()?.path}>{path(model.location()?.path ?? "")}</span>
      <span class="jello-file-meta">Entire file · read-only</span>
      <button type="button" aria-pressed={wrap()} onClick={() => setWrap(!wrap())}>Wrap</button>
      <ui.IconButton icon="refresh" label="Refresh source file" disabled={model.loading()} onClick={() => void model.refresh()} />
    </div>
    <Show when={model.hasChanges}><div class="jello-file-change-legend" role="status">
      <span title="Green: added · blue: modified · red: deleted">▰ Current JJ change · ▱ Since main/master fork</span>
      <Show when={model.changesLoading()}> · Loading gutter signs…</Show>
      <Show when={model.changes()?.note}>{(note) => <span> · {note()}</span>}</Show>
      <Show when={model.changesError()}>{(error) => <span> · Gutter signs unavailable: {error()}</span>}</Show>
    </div></Show>
    <div class="jello-file-queries" role="toolbar" aria-label="Language queries">
      <For each={navigationQueries}>{(query) => <button type="button" disabled={queryDisabled()} title={query.shortcut} onClick={() => run(query.kind)}>{query.label}</button>}</For>
      <button type="button" disabled={queryDisabled()} title="Shift+K" onClick={() => run("hover")}>Hover</button>
      <span role="status">{model.queryLoading() ? "Looking up symbol…" : model.highlightLoading() ? "Finding occurrences…" : model.target()?.text ?? "Select a symbol to query"}</span>
    </div>
    <Show when={model.error()}>{(error) => <div class="jello-file-error" role="alert">{error()} <button type="button" onClick={() => void model.refresh()}>Retry</button></div>}</Show>
    <Show when={model.queryError()}>{(error) => <div class="jello-file-error" role="alert">{error()}</div>}</Show>
    <Show when={model.highlightError()}>{(error) => <div class="jello-file-error" role="alert">Could not highlight occurrences: {error()}</div>}</Show>
    <Show when={model.hover() !== undefined}><div class="jello-file-hover" aria-label="Hover information">
      <ui.IconButton icon="close" label="Dismiss hover information" onClick={model.dismissHover} /><pre>{model.hover()}</pre>
    </div></Show>
    <div class="jello-file-body">
      <Show when={listedResults()}>{(results) => <nav class="jello-file-results" aria-label={results().label}>
        <strong>{results().label} ({results().locations.length}{results().truncated ? "+" : ""})</strong>
        <Show when={results().locations.length} fallback={<p>No results found.</p>}>
          <For each={results().locations}>{(location, index) => <button type="button" title={location.path}
            aria-current={model.location()?.path === location.path && model.location()?.line === location.line && model.location()?.character === location.character ? "true" : undefined}
            onClick={() => { void model.selectResult(index()) }}>
            {path(location.path)}<span>:{location.line + 1}:{location.character + 1}</span>
          </button>}</For>
        </Show>
      </nav>}</Show>
      <div class="jello-file-stage">
        <Show when={model.loading()}><p role="status">Loading source file…</p></Show>
        <Show when={model.document()}><FileCode model={model} theme={props.theme} wrap={wrap()} menu={(x, y) => setMenu({ x, y })} /></Show>
      </div>
    </div>
    <Show keyed when={menu()}>{(position) => <FileQueryMenu x={position.x} y={position.y} symbol={model.target()?.text ?? "Symbol"}
      disabled={queryDisabled()} run={run} close={closeMenu} mount={panel.closest("dialog") ?? undefined} />}</Show>
  </div>
}

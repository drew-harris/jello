import { createMemo, createSignal, createUniqueId, For, onMount, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { errorMessage } from "../errors"
import { matchingBookmarks } from "./bookmark-completion"

export function BookmarkDialog(props: {
  changeID: string
  load(): Promise<string[]>
  save(name: string): Promise<void>
  close(): void
}) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const id = createUniqueId()
  const [names, setNames] = createSignal<string[]>([])
  const [name, setName] = createSignal("")
  const [loading, setLoading] = createSignal(true)
  const [busy, setBusy] = createSignal(false)
  const [loadError, setLoadError] = createSignal("")
  const [error, setError] = createSignal("")
  const [active, setActive] = createSignal(-1)
  let input!: HTMLInputElement
  const matches = createMemo(() => matchingBookmarks(names(), name()))
  const options = createMemo(() => {
    const items = matches().slice(0, 50).map((value) => ({ name: value, create: false }))
    if (name().trim() && !matches().length) items.push({ name: name().trim(), create: true })
    return items
  })
  const activeIndex = () => active() >= 0 && active() < options().length ? active() : name().trim() && options().length ? 0 : -1
  const selectedName = () => options()[activeIndex()]?.name ?? name().trim()
  const load = async () => {
    setLoading(true)
    setLoadError("")
    try { setNames(await props.load()) }
    catch (error) { setLoadError(errorMessage(error)) }
    finally { setLoading(false); setActive(-1) }
  }
  onMount(() => { input.focus(); void load() })
  const choose = (value: string) => { setName(value); setActive(-1); input.focus() }
  const submit = async (value = selectedName()) => {
    if (busy() || loading() || loadError() || !value) return
    setBusy(true)
    setError("")
    try {
      await props.save(value)
      props.close()
      ctx.toast.show({ variant: "success", title: `Bookmark ${value} set` })
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <ui.Dialog title="Set bookmark" description={`Choose or create a bookmark on ${props.changeID.slice(0, 8)}.`}
    footer={<div class="jello-jj-actions">
      <ui.Button disabled={busy()} onClick={props.close}>Cancel</ui.Button>
      <ui.Button variant="contrast" busy={busy()} disabled={busy() || loading() || !!loadError() || !name().trim()}
        onClick={() => void submit()}>{name().trim() && !matches().length && !loading() ? "Create bookmark" : "Set bookmark"}</ui.Button>
    </div>}>
    <div class="jello-jj-bookmark-picker" data-mode={ctx.appearance.mode()}>
      <label class="jello-jj-message-label" for={`${id}-input`}>Bookmark name</label>
      <input ref={input} id={`${id}-input`} type="text" role="combobox" class="jello-jj-tree-description-input"
        placeholder="Search bookmarks or enter a new name" value={name()} disabled={busy()} autofocus autocomplete="off"
        aria-autocomplete="list" aria-expanded={!loading() && !loadError() && options().length > 0}
        aria-controls={`${id}-options`} aria-activedescendant={activeIndex() >= 0 ? `${id}-option-${activeIndex()}` : undefined}
        onInput={(event) => { setName(event.currentTarget.value); setActive(-1); setError("") }}
        onKeyDown={(event) => {
          if (event.isComposing) return
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            if (!options().length) return
            const next = activeIndex() < 0 ? (event.key === "ArrowDown" ? 0 : options().length - 1)
              : (activeIndex() + (event.key === "ArrowDown" ? 1 : -1) + options().length) % options().length
            setActive(next)
            document.getElementById(`${id}-option-${next}`)?.scrollIntoView({ block: "nearest" })
          }
          if (event.key === "Enter") {
            event.preventDefault()
            const value = selectedName()
            setName(value)
            void submit(value)
          }
          if (event.key === "Tab" && activeIndex() >= 0) { choose(selectedName()) }
        }} />
      <Show when={!loading()} fallback={<p role="status" class="jello-jj-bookmark-picker-hint">Loading bookmarks…</p>}>
        <Show when={!loadError()} fallback={<div role="alert"><p>{loadError()}</p><ui.Button onClick={() => void load()}>Retry</ui.Button></div>}>
          <ul id={`${id}-options`} role="listbox" aria-label="Bookmarks" class="jello-jj-bookmark-options">
            <For each={options()}>{(option, index) => <li id={`${id}-option-${index()}`} role="option"
              aria-selected={activeIndex() === index()} classList={{ "is-active": activeIndex() === index() }}
              onMouseDown={(event) => event.preventDefault()} onClick={() => { if (!busy()) choose(option.name) }}>
              <span aria-hidden="true"><ui.Icon name={option.create ? "branch-out" : "branch"} size="small" /></span>
              <span>{option.create ? `Create “${option.name}”` : option.name}</span>
            </li>}</For>
          </ul>
          <Show when={!options().length}><p class="jello-jj-bookmark-picker-hint">No bookmarks yet. Enter a name to create one.</p></Show>
          <Show when={matches().length > 50}><p class="jello-jj-bookmark-picker-hint">Showing 50 matches. Keep typing to narrow the list.</p></Show>
          <Show when={name().trim() && matches().length}><p class="jello-jj-bookmark-picker-hint">Enter sets “{selectedName()}” on the selected change.</p></Show>
        </Show>
      </Show>
      <Show when={error()}><p role="alert">{error()}</p></Show>
    </div>
  </ui.Dialog>
}

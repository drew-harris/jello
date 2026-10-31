import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { errorMessage } from "../errors"
import { squashDescription, type SquashDetails } from "./squash-model"

export function SquashDialog(props: {
  changeID: string
  load(): Promise<SquashDetails>
  save(parentID: string, message?: string): Promise<void>
  close(): void
}) {
  const ctx = usePlugin()
  const ui = ctx.ui
  let actions!: HTMLDivElement
  let parentPicker: HTMLSelectElement | undefined
  let disposed = false
  onCleanup(() => { disposed = true })
  const [details, setDetails] = createSignal<{ data?: SquashDetails; error: string }>({ error: "" })
  const [loading, setLoading] = createSignal(true)
  const load = async () => {
    setLoading(true)
    try { setDetails({ data: await props.load(), error: "" }) }
    catch (error) { setDetails({ error: errorMessage(error) }) }
    finally { setLoading(false) }
  }
  onMount(() => void load())
  const [parentID, setParentID] = createSignal("")
  const [message, setMessage] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal("")
  const parent = createMemo(() => {
    const parents = details()?.data?.parents ?? []
    return parents.find((parent) => parent.commitID === parentID()) ?? (parents.length === 1 ? parents[0] : undefined)
  })
  const combined = () => !!parent()?.description.trim() && !!details()?.data?.sourceDescription.trim()
  const description = () => squashDescription(parent()?.description ?? "", details()?.data?.sourceDescription ?? "")
  // The primary button starts disabled while parent metadata loads. Dialog
  // autofocus alone cannot focus it again when it becomes enabled.
  createEffect(on(loading, (pending) => {
    if (pending) return
    queueMicrotask(() => {
      if (disposed) return
      if (parentPicker && !parent()) parentPicker.focus()
      else Array.from(actions.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")).at(-1)?.focus()
    })
  }))
  const submit = async () => {
    const target = parent()
    if (!target || target.immutable || busy() || loading()) return
    setBusy(true)
    setError("")
    try {
      await props.save(target.commitID, combined() ? message() ?? description() : undefined)
      props.close()
      ctx.toast.show({ variant: "success", title: "Change squashed into parent" })
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <ui.Dialog title="Squash below" description={`Squash ${props.changeID.slice(0, 8)} into its parent, removing the source change.`}
    footer={<div ref={actions} class="jello-jj-actions">
      <ui.Button disabled={busy()} onClick={props.close}>Cancel</ui.Button>
      <ui.Button variant="contrast" busy={busy()} disabled={busy() || loading() || !parent() || parent()?.immutable}
        autofocus onClick={() => void submit()}>Squash below</ui.Button>
    </div>}>
    <Show when={!loading()} fallback={<p role="status">Loading parent changes…</p>}>
      <Show when={!details()?.error} fallback={<div role="alert"><p>{details()?.error}</p><ui.Button onClick={() => void load()}>Retry</ui.Button></div>}>
        <Show when={(details()?.data?.parents.length ?? 0) > 1}>
          <label class="jello-jj-message-label">Parent change
            <select ref={parentPicker} class="jello-jj-tree-description-input" disabled={busy()} value={parentID()}
              onChange={(event) => { setParentID(event.currentTarget.value); setMessage(undefined); setError("") }}>
              <option value="">Choose a parent…</option>
              <For each={details()?.data?.parents}>{(parent) => <option value={parent.commitID} disabled={parent.immutable}>
                {parent.changeID.slice(0, 8)} — {parent.description.split("\n")[0] || "No description"}{parent.immutable ? " (immutable)" : ""}
              </option>}</For>
            </select>
          </label>
        </Show>
        <Show when={parent()}>{(target) => <>
          <p>Into {target().changeID.slice(0, 8)} — {target().description.split("\n")[0] || "No description"}</p>
          <Show when={target().immutable}><p role="alert">Cannot squash into an immutable parent.</p></Show>
          <Show when={combined()} fallback={<p>The resulting description will be {description() ? `“${description()}”` : "empty"}.</p>}>
            <label class="jello-jj-message-label">Combined description
              <textarea class="jello-jj-tree-description-input" rows={8} disabled={busy()} value={message() ?? description()}
                onInput={(event) => setMessage(event.currentTarget.value)} />
            </label>
          </Show>
        </>}</Show>
      </Show>
    </Show>
    <Show when={busy()}><p role="status">Squashing change…</p></Show>
    <Show when={error()}><p role="alert">{error()}</p></Show>
  </ui.Dialog>
}

import { createEffect, createUniqueId, on, onCleanup, onMount, Show, type Accessor } from "solid-js"
import { Portal } from "solid-js/web"
import { usePlugin } from "@opencode/plugin/gui"
import type { PeekKind, PeekResult } from "./rpc"
import type { LanguageClient } from "./client"
import { createFileViewModel } from "./file-model"
import { FileView } from "./file-view"
import { createPeekEscape } from "./peek-escape"
import type { FileChangeProvider } from "./file-changes"

export interface PeekPanelModel {
  opened: Accessor<boolean>
  kind: Accessor<PeekKind>
  target: Accessor<{ text: string } | undefined>
  result: Accessor<PeekResult | undefined>
  loading: Accessor<boolean>
  error: Accessor<string>
  client: LanguageClient
  fileChanges?: FileChangeProvider
  source?: Accessor<string | undefined>
  open(kind: PeekKind): void | Promise<void>
  close(): void
  keydown(event: KeyboardEvent): void
}

// A peek is a launch context for a file view, not a separate source renderer.
export function CodePeekPanel(props: { peek: PeekPanelModel; directory: string; theme?: string }) {
  return <Show when={props.peek.opened()}><PeekModal {...props} /></Show>
}

function PeekModal(props: { peek: PeekPanelModel; directory: string; theme?: string }) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const file = createFileViewModel(props.peek.client, props.peek.fileChanges)
  const title = () => {
    const source = props.peek.source?.()
    return source ? `File: ${source} · working copy` : `${props.peek.kind() === "definition" ? "Definition" : "References"}: ${props.peek.target()?.text ?? "Symbol"}`
  }
  createEffect(on(() => props.peek.result(), (result) => {
    if (result) void file.seed({ ...result, label: title() })
    else file.reset()
  }))
  const escape = createPeekEscape({
    escape: file.escape,
    close: () => props.peek.close(),
    inMenu: (event) => event.composedPath().some((node) => node instanceof HTMLElement && node.getAttribute("role") === "menu"),
  })
  const titleID = createUniqueId()
  let modal!: HTMLDialogElement
  let backdropPressed = false
  let disposed = false
  const outside = (event: MouseEvent | PointerEvent) => {
    const bounds = modal.getBoundingClientRect()
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom
  }
  onMount(() => {
    // Native modal top-layer placement avoids clipping by diff panes and gives
    // us browser-managed inertness, focus trapping and focus restoration.
    modal.showModal()
    // Use native capture, before Solid's delegated handlers or the dialog's
    // default close action; source, header and toolbar focus behave identically.
    modal.addEventListener("keydown", escape.keydown, true)
    modal.addEventListener("keyup", escape.keyup, true)
    const target = modal.querySelector<HTMLElement>(".jello-file-view") ?? modal
    target.focus({ preventScroll: true })
  })
  onCleanup(() => {
    disposed = true
    modal.removeEventListener("keydown", escape.keydown, true)
    modal.removeEventListener("keyup", escape.keyup, true)
    modal.close()
  })
  createEffect(on(() => props.peek.result(), () => {
    if (document.activeElement === modal) modal.querySelector<HTMLElement>(".jello-file-view")?.focus({ preventScroll: true })
  }))
  // Host dialogs must not end up inaccessible underneath a native modal.
  createEffect(() => { if (ctx.dialogs.active()) props.peek.close() })
  return <Portal>
    <dialog ref={modal} class="jello-peek jello-peek-modal" data-mode={ctx.appearance.mode()} aria-labelledby={titleID} aria-modal="true"
      onCancel={escape.cancel}
      onClose={() => { if (!disposed && props.peek.opened()) props.peek.close() }}
      onPointerDown={(event) => { backdropPressed = event.target === modal && outside(event) }}
      onPointerCancel={() => { backdropPressed = false }}
      onClick={(event) => {
        if (backdropPressed && event.target === modal && outside(event)) props.peek.close()
        backdropPressed = false
      }}
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.composedPath().some((node) => node instanceof HTMLElement && node.getAttribute("role") === "menu")) return
        if (event.composedPath().some((node) => node instanceof HTMLElement && node.classList.contains("jello-file-view"))) return
        props.peek.keydown(event)
      }}>
      <header>
        <strong id={titleID}>{title()}</strong>
        <span class="jello-peek-spacer" />
        <Show when={!props.peek.source?.()}><button type="button" onClick={() => void props.peek.open(props.peek.kind())} disabled={props.peek.loading()}>{props.peek.error() ? "Retry" : "Refresh query"}</button></Show>
        <ui.IconButton icon="close" label="Close peek (Escape)" onClick={props.peek.close} />
      </header>
      <Show when={props.peek.loading()}><p role="status">Looking up {props.peek.kind()}… First lookup may take a moment while TypeScript loads the project.</p></Show>
      <Show when={props.peek.error()}><p role="alert">{props.peek.error()}</p></Show>
      <Show when={props.peek.result()}>{(result) => <Show when={result().locations.length} fallback={<p role="status">No {props.peek.kind() === "definition" ? "definition" : "references"} found.</p>}>
        <FileView model={file} directory={props.directory} theme={props.theme} />
      </Show>}</Show>
    </dialog>
  </Portal>
}

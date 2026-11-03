import { createSignal, For, onMount, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { errorMessage } from "../../shared/errors"
import type { ChangedFile } from "./changed-files"
import { createAsyncAction } from "../../shared/gui/async-action"

export function CommitDialog(props: {
  directory: string
  commit(message: string): Promise<void>
  loadFiles(): Promise<ChangedFile[]>
  close(): void
  onCommitted(): void
}) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const [message, setMessage] = createSignal("")
  const action = createAsyncAction({ toast: ctx.toast })
  const busy = action.pending
  const error = action.error
  const [files, setFiles] = createSignal<ChangedFile[]>([])
  const [loadingFiles, setLoadingFiles] = createSignal(true)
  const [filesError, setFilesError] = createSignal<string>()
  const fileLimit = 10
  onMount(() => {
    void props.loadFiles().then(setFiles).catch((error) => setFilesError(errorMessage(error))).finally(() => setLoadingFiles(false))
  })
  const submit = async () => {
    if (busy() || !message().trim()) return
    await action.run(async () => {
      await props.commit(message().trim())
      props.onCommitted()
      props.close()
    }, { success: "Committed; new working copy created" })
  }

  return (
    <ui.Dialog title="Commit" description={`Commit all working-copy changes in ${props.directory} and start a new empty change.`}
      footer={<div class="jello-jj-actions">
        <ui.Button disabled={busy()} onClick={props.close}>Cancel</ui.Button>
        <ui.Button variant="contrast" busy={busy()} disabled={!message().trim() || busy()} onClick={() => void submit()}>Commit</ui.Button>
      </div>}
    >
      <section class="jello-jj-commit-files" aria-label="Changed files" data-mode={ctx.appearance.mode()}>
        <Show when={!loadingFiles()} fallback={<p role="status">Loading changed files…</p>}>
          <Show when={!filesError()} fallback={<p role="alert">Could not load changed files: {filesError()}</p>}>
            <p class="jello-jj-commit-files-heading">{files().length} changed {files().length === 1 ? "file" : "files"}</p>
            <ul><For each={files().slice(0, fileLimit)}>{(file) => <li>
              <span class="jello-jj-commit-file-status" data-status={file.status} title={file.status}>{file.status === "removed" ? "D" : file.status.slice(0, 1).toUpperCase()}</span>
              <span class="jello-jj-commit-file-path" title={file.path}>{file.path}</span>
            </li>}</For></ul>
            <Show when={files().length > fileLimit}><p>and {files().length - fileLimit} more…</p></Show>
          </Show>
        </Show>
      </section>
      <label class="jello-jj-message-label">
        Commit message
        <textarea
          class="jello-jj-message"
          placeholder="Describe this change"
          rows={6}
          value={message()}
          onInput={(event) => setMessage(event.currentTarget.value)}
          disabled={busy()}
          autofocus
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.isComposing) {
              event.preventDefault()
              void submit()
            }
          }}
        />
      </label>
      <Show when={error()}><p role="alert">{error()}</p></Show>
    </ui.Dialog>
  )
}

import { createSignal, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"

export function CommitDialog(props: {
  directory: string
  commit(message: string): Promise<void>
  close(): void
  onCommitted(): void
}) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const [message, setMessage] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const submit = async () => {
    if (busy() || !message().trim()) return
    setBusy(true)
    setError(undefined)
    try {
      await props.commit(message().trim())
      props.onCommitted()
      props.close()
      ctx.toast.show({ variant: "success", title: "Committed; new working copy created" })
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ui.Dialog title="Commit" description={`Commit all working-copy changes in ${props.directory} and start a new empty change.`}
      footer={<div class="jello-jj-actions">
        <ui.Button disabled={busy()} onClick={props.close}>Cancel</ui.Button>
        <ui.Button variant="contrast" busy={busy()} disabled={!message().trim() || busy()} onClick={() => void submit()}>Commit</ui.Button>
      </div>}
    >
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

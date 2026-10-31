import { createSignal, onMount, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { errorMessage } from "../errors"

export function DescribeDialog(props: {
  changeID: string
  description: string
  describe(message: string): Promise<void>
  close(): void
}) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const [message, setMessage] = createSignal(props.description.split("\n")[0])
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal("")
  let input!: HTMLInputElement
  onMount(() => { input.focus(); input.select() })
  const submit = async () => {
    if (busy()) return
    setBusy(true)
    setError("")
    try {
      await props.describe(message().trim())
      props.close()
      ctx.toast.show({ variant: "success", title: "Description updated" })
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return <ui.Dialog title="Describe change" description={`Replace the description of ${props.changeID.slice(0, 8)}.`}
    footer={<div class="jello-jj-actions">
      <ui.Button disabled={busy()} onClick={props.close}>Cancel</ui.Button>
      <ui.Button variant="contrast" busy={busy()} disabled={busy()} onClick={() => void submit()}>Save</ui.Button>
    </div>}>
    <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <label class="jello-jj-message-label">Description
        <input ref={input} type="text" class="jello-jj-tree-description-input" value={message()} disabled={busy()}
          placeholder="Describe this change" autofocus
          onInput={(event) => setMessage(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.isComposing) {
              event.preventDefault()
              void submit()
            }
          }} />
      </label>
      <Show when={error()}><p role="alert">{error()}</p></Show>
    </form>
  </ui.Dialog>
}

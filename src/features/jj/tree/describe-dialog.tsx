import { createSignal, onMount, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { createAsyncAction } from "../../../shared/gui/async-action"

export function DescribeDialog(props: {
  changeID: string
  description: string
  describe(message: string): Promise<void>
  close(): void
}) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const [message, setMessage] = createSignal(props.description.split("\n")[0])
  const action = createAsyncAction({ toast: ctx.toast })
  const busy = action.pending
  const error = action.error
  let input!: HTMLInputElement
  onMount(() => { input.focus(); input.select() })
  const submit = async () => {
    if (busy()) return
    await action.run(async () => {
      await props.describe(message().trim())
      props.close()
    }, { success: "Description updated" })
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

import { createResource, Show } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { Status } from "./rpc"
import type { definition } from "../../gui/definition"

// Read props.session reactively: the panel stays mounted across sessions.
export function PanelView(props: { readonly session: MountedSession; readonly revision: number }) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const [status, { refetch }] = createResource(
    () => ({ directory: props.session.directory, client: props.session.server.client, revision: props.revision }),
    async ({ directory, client }) => {
      try {
        const result = (await client.rpc(Status).status({ directory })) as { text: string }
        return { text: result.text, error: false }
      } catch (error) {
        return { text: error instanceof Error ? error.message : String(error), error: true }
      }
    },
  )

  return (
    <div class="jello-jj-panel">
      <h2>jj status</h2>
      <p>Session directory: {props.session.directory}</p>
      <div class="jello-jj-actions">
        <ui.Button busy={status.loading} onClick={() => void refetch()}>
          Refresh
        </ui.Button>
      </div>
      <Show when={status.loading} fallback={
        <pre class="jello-jj-status" role={status()?.error ? "alert" : "status"}>{status()?.text}</pre>
      }>
        <p role="status">Loading jj status…</p>
      </Show>
    </div>
  )
}

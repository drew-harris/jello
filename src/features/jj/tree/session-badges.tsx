import { For, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import type { WorktreeSession } from "./worktree-sessions"

export function SessionBadges(props: { sessions: readonly WorktreeSession[]; server: string; outside?: boolean }) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const open = (session: WorktreeSession) => ctx.tabs.open({ server: props.server, id: session.sessionID }, { focus: true })
  const label = (session: WorktreeSession) => `${session.title}${props.outside ? ` · ${session.commitID.slice(0, 8)}` : ""}`
  const tooltip = (session: WorktreeSession) => `${session.title}\nWorkspace: ${session.workspace}\n${session.directory}\n${session.busy ? "Running · " : ""}Last snapshotted position: ${session.commitID}`
  return <div class="jello-jj-tree-sessions" role="group" aria-label="Sessions in worktrees">
    <For each={props.sessions.slice(0, 3)}>{(session) => <button type="button" class="jello-jj-tree-session"
      title={tooltip(session)} aria-label={`Open session ${session.title} in workspace ${session.workspace}`}
      classList={{ "is-busy": session.busy }} onClick={() => open(session)}>
      <span aria-hidden="true"><ui.Icon name="comment" size="small" /></span>
      <span>{label(session)}</span>
    </button>}</For>
    <Show when={props.sessions.length > 3}>
      <button type="button" class="jello-jj-tree-session" onClick={() => {
        // Capture before opening: a polling refresh must not switch the dialog's
        // server or targets while a user is choosing a session.
        const sessions = [...props.sessions]
        const server = props.server
        ctx.dialogs.open((dialog) => <ui.Dialog title="Sessions in worktrees" description="Positions reflect the last JJ snapshot, not unsaved file edits.">
          <div class="jello-jj-tree-session-list">
            <For each={sessions}>{(session) => <ui.Button onClick={() => {
              dialog.close()
              ctx.tabs.open({ server, id: session.sessionID }, { focus: true })
            }}>{session.title} · {session.workspace} · {session.commitID.slice(0, 8)}</ui.Button>}</For>
          </div>
        </ui.Dialog>)
      }}>+{props.sessions.length - 3} sessions</button>
    </Show>
  </div>
}

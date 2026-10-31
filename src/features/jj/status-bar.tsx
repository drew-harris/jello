import { createResource, For, onCleanup, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { Status } from "./rpc"
import type { definition } from "../../gui/definition"
import { summarizeStatus } from "./status-summary"
import type { Overview, Revision } from "./overview"
import { CommitDialog } from "./commit-dialog"

function RevisionLabel(props: { revision: Revision }) {
  return (
    <span class="jello-jj-revision" classList={{ "jello-jj-parent": !props.revision.current }}>
      <span class="jello-jj-revision-label">{props.revision.current ? "@" : "@−"}</span>
      <span class="jello-jj-change-id">{props.revision.changeID}</span>
      <Show when={props.revision.immutable}><span class="jello-jj-immutable" title="Immutable revision">◆</span></Show>
      <Show when={props.revision.bookmarks.length}>
        <span class="jello-jj-bookmarks" title={props.revision.bookmarks.join(", ")}>{props.revision.bookmarks.join(", ")}</span>
      </Show>
      <Show when={props.revision.empty}><span class="jello-jj-empty" title="Empty revision">○</span></Show>
      <span class="jello-jj-description" title={props.revision.description || "(blank)"}>{props.revision.description || "(blank)"}</span>
    </span>
  )
}

export function StatusBar(props: { readonly revision: number; onCommitted(): void }) {
  const ctx = usePlugin<typeof definition>()
  const [status, { refetch }] = createResource(
    () => {
      const session = ctx.sessions.current()
      return session && {
        directory: session.directory,
        server: session.server.id,
        client: session.server.client,
        revision: props.revision,
      }
    },
    async ({ directory, server, client }) => {
      try {
        const { text, revisions } = (await client.rpc(Status).overview({ directory })) as Overview
        return { directory, server, text, revisions, summary: summarizeStatus(text), error: false }
      } catch (error) {
        return {
          directory, server,
          text: error instanceof Error ? error.message : String(error),
          summary: "jj · status unavailable",
          revisions: [] as Revision[],
          error: true,
        }
      }
    },
  )

  const refresh = () => {
    if (ctx.sessions.current() && !document.hidden && !status.loading) void refetch()
  }
  const timer = setInterval(refresh, 10_000)
  window.addEventListener("focus", refresh)
  onCleanup(() => {
    clearInterval(timer)
    window.removeEventListener("focus", refresh)
  })

  const current = () => {
    const session = ctx.sessions.current()
    const result = status.latest
    return result?.directory === session?.directory && result?.server === session?.server.id ? result : undefined
  }

  const openCommit = () => {
    const session = ctx.sessions.current()
    if (!session) return
    const directory = session.directory
    const client = session.server.client
    ctx.dialogs.open((dialog) => <CommitDialog
      directory={directory}
      close={dialog.close}
      onCommitted={props.onCommitted}
      commit={async (message) => { await client.rpc(Status).commit({ directory, message }) }}
    />)
  }

  return (
    <Show when={ctx.sessions.current()}>
      <div
        class="jello-jj-status-bar"
        data-mode={ctx.appearance.mode()}
        classList={{ "jello-jj-status-bar-error": current()?.error }}
      >
      <button
        type="button"
        class="jello-jj-status-main"
        title={current()?.text || "Open JJ"}
        aria-label={`Open JJ: ${current()?.summary || "Loading jj status…"}`}
        onClick={() => void ctx.commands.run(`${ctx.id}.jj.open`)}
      >
        <span class="jello-jj-brand">jj</span>
        <Show when={current()?.revisions.length} fallback={
          <span class="jello-jj-description">{current()?.summary.replace(/^jj · /, "") || "Loading jj status…"}</span>
        }>
          <For each={current()?.revisions.filter((revision) => revision.current)}>
            {(revision) => <RevisionLabel revision={revision} />}
          </For>
          <Show when={current()?.revisions.some((revision) => !revision.current)}>
            <span class="jello-jj-parent-arrow" aria-label="parent">←</span>
          </Show>
          <For each={current()?.revisions.filter((revision) => !revision.current)}>
            {(revision) => <RevisionLabel revision={revision} />}
          </For>
          <span class="jello-jj-file-counts">
            <For each={current()?.summary.split(" · ").slice(2)}>
              {(count, index) => <>
                <Show when={index() > 0}><span class="jello-jj-count-separator"> · </span></Show>
                <span classList={{
                  "jello-jj-modified": count.endsWith(" modified"),
                  "jello-jj-added": count.endsWith(" added"),
                  "jello-jj-deleted": count.endsWith(" deleted"),
                  "jello-jj-conflicts": count === "conflicts",
                }} title={count} aria-label={count}>
                  {count.replace(/^(\d+) modified$/, "~$1").replace(/^(\d+) added$/, "+$1").replace(/^(\d+) deleted$/, "−$1")}
                </span>
              </>}
            </For>
          </span>
        </Show>
      </button>
      <button type="button" class="jello-jj-commit" onClick={openCommit} disabled={!current() || current()?.error}
        title="Commit working-copy changes and start a new change">Commit</button>
      </div>
    </Show>
  )
}

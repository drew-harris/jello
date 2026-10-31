import { createResource, For, onCleanup, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { Status } from "./rpc"
import type { definition } from "../../gui/definition"
import { summarizeStatus } from "./status-summary"
import type { Overview, Revision } from "./overview"
import { diffTabID } from "./diff/tab"
import { errorMessage } from "./errors"

function RevisionLabel(props: { revision: Revision; open(): void }) {
  const content = () => <>
      <span class="jello-jj-revision-label">{["Current", "Parent", "Earlier"][props.revision.depth]}</span>
      <span class="jello-jj-change-id">{props.revision.changeID}</span>
      <Show when={props.revision.immutable}>
        <svg class="jello-jj-immutable" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" role="img" aria-label="Immutable revision">
          <rect x="3" y="7" width="10" height="7" rx="2" />
          <path d="M5 7V5a3 3 0 0 1 6 0v2" />
        </svg>
      </Show>
      <Show when={props.revision.bookmarks.length}>
        <span class="jello-jj-bookmarks" title={props.revision.bookmarks.join(", ")}>{props.revision.bookmarks.join(", ")}</span>
      </Show>
      <Show when={props.revision.empty}><span class="jello-jj-empty" title="Empty revision">○</span></Show>
      <span class="jello-jj-description" classList={{ "is-placeholder": !props.revision.description }} title={props.revision.description || "No description"}>{props.revision.description || "No description"}</span>
  </>
  return <Show when={!props.revision.current} fallback={<span class="jello-jj-revision">{content()}</span>}>
    <button type="button" class="jello-jj-revision jello-jj-parent jello-jj-revision-link" onClick={props.open}
      aria-label={`View diff for ${props.revision.changeID}: ${props.revision.description || "No description"}`}>
      {content()}
    </button>
  </Show>
}

export function StatusBar(props: { readonly revision: number }) {
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
        const { text, revisions, lines } = (await client.rpc(Status).overview({ directory })) as Overview
        return { directory, server, text, revisions, lines, summary: summarizeStatus(text), error: false }
      } catch (error) {
        return {
          directory, server,
          text: errorMessage(error),
          summary: "jj · status unavailable",
          revisions: [] as Revision[],
          lines: { modified: 0, added: 0, deleted: 0 },
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

  const openCommit = () => void ctx.commands.run(`${ctx.id}.jj.commit`)

  return (
    <Show when={ctx.sessions.current()}>
      <div
        class="jello-jj-status-bar"
        role="region"
        aria-label="JJ working copy"
        data-mode={ctx.appearance.mode()}
        classList={{ "jello-jj-status-bar-error": current()?.error }}
      >
      <div
        class="jello-jj-status-main"
        title={current()?.text}
      >
        <Show when={current()?.revisions.length} fallback={
          <span class="jello-jj-description">{current()?.summary.replace(/^jj · /, "") || "Loading jj status…"}</span>
        }>
          <For each={[0, 1, 2]}>
            {(depth) => <>
              <Show when={depth > 0 && current()?.revisions.some((revision) => revision.depth === depth)}>
                <svg class="jello-jj-parent-arrow" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                  <path d="m10 3-5 5 5 5" />
                </svg>
              </Show>
              <For each={current()?.revisions.filter((revision) => revision.depth === depth)}>
                {(revision) => <RevisionLabel revision={revision} open={() => {
                  const session = ctx.sessions.current()
                  if (!session) return
                  const directory = current()?.directory
                  if (!directory) return
                  ctx.layout.open(`${ctx.id}:${diffTabID({ directory, commitID: revision.commitID })}`, session, { tab: "select" })
                }} />}
              </For>
            </>}
          </For>
          <Show when={Object.values(current()?.lines ?? {}).some((count) => count > 0) || current()?.summary.includes(" · conflicts")}>
          <span class="jello-jj-line-counts" aria-label="Line changes">
            <For each={[
              { kind: "modified" as const, symbol: "~", label: "replaced" },
              { kind: "added" as const, symbol: "+", label: "added" },
              { kind: "deleted" as const, symbol: "−", label: "deleted" },
            ]}>
              {(item) => <Show when={current()?.lines[item.kind]}>
                <span class={`jello-jj-count jello-jj-${item.kind}`}
                  title={`${current()?.lines[item.kind]} lines ${item.label}`}
                  aria-label={`${current()?.lines[item.kind]} lines ${item.label}`}>
                  {item.symbol}{current()?.lines[item.kind]}
                </span>
              </Show>}
            </For>
            <Show when={current()?.summary.includes(" · conflicts")}>
              <span class="jello-jj-count jello-jj-conflicts">conflicts</span>
            </Show>
          </span>
          </Show>
        </Show>
      </div>
      <button type="button" class="jello-jj-commit" onClick={openCommit} disabled={!current() || current()?.error}
        title="Commit working-copy changes and start a new change">Commit</button>
      </div>
    </Show>
  )
}

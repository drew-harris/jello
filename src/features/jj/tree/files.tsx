import { createResource, For, Show, Suspense } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { Status } from "../rpc"
import { errorMessage } from "../errors"
import type { ChangedFile } from "../changed-files"
import { diffTabID } from "../diff/tab"

export function RevisionFiles(props: { session: MountedSession; commitID: string }) {
  // The boundary must mount before the resource is created, otherwise its first
  // read suspends the entire tree panel when an inline file list is expanded.
  return <Suspense fallback={<div class="jello-jj-tree-files">
    <div class="jello-jj-tree-files-state" role="status">Loading files…</div>
  </div>}>
    <RevisionFileContents session={props.session} commitID={props.commitID} />
  </Suspense>
}

function RevisionFileContents(props: { session: MountedSession; commitID: string }) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const [files, { refetch }] = createResource(
    () => ({ directory: props.session.directory, client: props.session.server.client, commitID: props.commitID }),
    async ({ directory, client, commitID }) => {
      try { return { files: await client.rpc(Status).revisionFiles({ directory, commitID }) as ChangedFile[], error: "" } }
      catch (error) { return { files: [] as ChangedFile[], error: errorMessage(error) } }
    },
  )
  const kind = (file: ChangedFile) => file.status === "removed" ? "D" : file.status.slice(0, 1).toUpperCase()
  return <div class="jello-jj-tree-files" role="region" aria-label="Changed files">
    <Show when={files.latest} fallback={<div class="jello-jj-tree-files-state" role="status">Loading files…</div>}>
      <Show when={!files.latest?.error} fallback={<div class="jello-jj-tree-files-state" role="alert">
        <span>{files.latest?.error}</span><button type="button" onClick={() => void refetch()}>Retry</button>
      </div>}>
        <div class="jello-jj-tree-files-heading">{files.latest?.files.length} changed {files.latest?.files.length === 1 ? "file" : "files"}</div>
        <Show when={files.latest?.files.length} fallback={<div class="jello-jj-tree-files-state">No file changes</div>}>
          <ul><For each={files.latest?.files}>{(file) => <li><button type="button" class="jello-jj-tree-file-link"
            title={`Open diff · ${file.path}`} aria-label={`Open diff for ${file.path}`}
            onClick={() => ctx.layout.open(`${ctx.id}:${diffTabID({ directory: props.session.directory, commitID: props.commitID, file: file.path })}`, props.session, { tab: "select" })}>
            <span class="jello-jj-tree-file-status" data-kind={kind(file)}>{kind(file)}</span>
            <span aria-hidden="true"><ui.Icon name="file-document" size="small" /></span>
            <span class="jello-jj-tree-file-path">{file.path}</span>
          </button></li>}</For></ul>
        </Show>
      </Show>
    </Show>
  </div>
}

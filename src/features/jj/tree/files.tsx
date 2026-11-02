import { createResource, For, Show, Suspense } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { Status } from "../rpc"
import { errorMessage } from "../errors"
import type { ChangedFile } from "../changed-files"
import { openRevisionDiff } from "../diff/navigation"
import { repositoryViewKey, type ViewCache } from "../view-cache"

interface RevisionFilesProps {
  session: MountedSession
  cache: ViewCache<ChangedFile[]>
  commitID: string
  changeID: string
  divergent: boolean
}

export function RevisionFiles(props: RevisionFilesProps) {
  // The boundary must mount before the resource is created, otherwise its first
  // read suspends the entire tree panel when an inline file list is expanded.
  return <Suspense fallback={<div class="jello-jj-tree-files">
    <div class="jello-jj-tree-files-state" role="status">Loading files…</div>
  </div>}>
    <RevisionFileContents session={props.session} cache={props.cache} commitID={props.commitID} changeID={props.changeID} divergent={props.divergent} />
  </Suspense>
}

function RevisionFileContents(props: RevisionFilesProps) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const cacheKey = () => JSON.stringify([repositoryViewKey(props.session.server.id, props.session.directory), props.commitID])
  const cached = props.cache.get(cacheKey())
  const [files, { refetch }] = createResource(
    () => ({ directory: props.session.directory, client: props.session.server.client, commitID: props.commitID, key: cacheKey() }),
    async ({ directory, client, commitID, key }) => {
      const saved = props.cache.get(key)
      if (saved) return { files: saved, error: "" }
      try {
        const files = await client.rpc(Status).revisionFiles({ directory, commitID }) as ChangedFile[]
        props.cache.set(key, files)
        return { files, error: "" }
      } catch (error) { return { files: [] as ChangedFile[], error: errorMessage(error) } }
    },
    { initialValue: cached ? { files: cached, error: "" } : undefined },
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
            onClick={() => openRevisionDiff(ctx, props.session, { directory: props.session.directory, commitID: props.commitID,
              changeID: props.changeID, divergent: props.divergent, file: file.path })}>
            <span class="jello-jj-tree-file-status" data-kind={kind(file)}>{kind(file)}</span>
            <span aria-hidden="true"><ui.Icon name="file-document" size="small" /></span>
            <span class="jello-jj-tree-file-path">{file.path}</span>
          </button></li>}</For></ul>
        </Show>
      </Show>
    </Show>
  </div>
}

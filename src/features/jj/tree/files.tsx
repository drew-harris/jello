import { For, Show } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { errorMessage } from "../../../shared/errors"
import type { ChangedFile } from "../changed-files"
import { openRevisionDiff } from "../diff/navigation"
import { repositoryServices, sessionRepository } from "../../../shared/gui/repository"
import { queryData } from "../../../shared/gui/query"
import { revisionFilesQuery } from "../queries"

interface RevisionFilesProps {
  session: MountedSession
  commitID: string
  changeID: string
  divergent: boolean
}

export function RevisionFiles(props: RevisionFilesProps) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const { client } = repositoryServices(ctx).queries
  const query = useQuery(() => revisionFilesQuery(client, sessionRepository(props.session), props.session.server.client, props.commitID), () => client)
  const files = () => queryData(query)
  const refetch = () => void query.refetch({ cancelRefetch: false })
  const kind = (file: ChangedFile) => file.status === "removed" ? "D" : file.status.slice(0, 1).toUpperCase()
  return <div class="jello-jj-tree-files" role="region" aria-label="Changed files">
    <Show when={query.error}>
      <div class="jello-jj-tree-files-state" role="alert"><span>{errorMessage(query.error)}</span><button type="button" onClick={refetch}>Retry</button></div>
    </Show>
    <Show when={files()} fallback={<Show when={!query.error}><div class="jello-jj-tree-files-state" role="status">Loading files…</div></Show>}>
      <div class="jello-jj-tree-files-heading">{files()?.length} changed {files()?.length === 1 ? "file" : "files"}</div>
      <Show when={files()?.length} fallback={<div class="jello-jj-tree-files-state">No file changes</div>}>
        <ul><For each={files()}>{(file) => <li><button type="button" class="jello-jj-tree-file-link"
          title={`Open diff · ${file.path}`} aria-label={`Open diff for ${file.path}`}
          onClick={() => openRevisionDiff(ctx, props.session, { directory: props.session.directory, commitID: props.commitID,
            changeID: props.changeID, divergent: props.divergent, file: file.path })}>
          <span class="jello-jj-tree-file-status" data-kind={kind(file)}>{kind(file)}</span>
          <span aria-hidden="true"><ui.Icon name="file-document" size="small" /></span>
          <span class="jello-jj-tree-file-path">{file.path}</span>
        </button></li>}</For></ul>
      </Show>
    </Show>
  </div>
}

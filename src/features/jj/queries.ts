import { queryOptions, type QueryClient } from "@tanstack/solid-query"
import type { MountedSession } from "@opencode/plugin/gui"
import type { Repository } from "../../shared/repository"
import { readQueryOptions } from "../../shared/gui/query"
import { Status } from "./rpc"
import type { TreeHistory } from "./tree/model"
import type { WorktreeSessionSnapshot } from "./tree/worktree-sessions"
import type { ChangedFile } from "./changed-files"
import type { Overview } from "./overview"
import type { RevisionDiff } from "./diff/server"
import { parseDiffTabID } from "./diff/tab"
import { reuseDiffFiles } from "./diff/files"
import { parsePatchFiles } from "@pierre/diffs"
import { DIFF_POLL_INTERVAL } from "./diff/poll"
import type { SquashDetails } from "./tree/squash-model"

type Client = MountedSession["server"]["client"]
// Until the server exposes stable store/workspace IDs, directory is the workspace
// boundary. Never share a query across servers, sessions' checkout paths or refs.
export const jjQueryKey = (repository: Repository) => ["jj", repository.server, repository.directory] as const

export const historyQuery = (cache: QueryClient, repository: Repository, client: Client, limit: number) => queryOptions(
  readQueryOptions<TreeHistory>(cache, [...jjQueryKey(repository), "history", limit], async (signal) =>
    await client.rpc(Status).tree({ directory: repository.directory, limit }, { signal, location: { directory: repository.directory } }) as TreeHistory))

export const positionsQuery = (cache: QueryClient, repository: Repository, client: Client) => queryOptions(
  readQueryOptions<WorktreeSessionSnapshot>(cache, [...jjQueryKey(repository), "positions"], async (signal) =>
    await client.rpc(Status).worktreeSessions({ directory: repository.directory }, { signal, location: { directory: repository.directory } }) as WorktreeSessionSnapshot))

export const overviewQuery = (cache: QueryClient, repository: Repository, client: Client) => queryOptions(
  readQueryOptions<Overview>(cache, [...jjQueryKey(repository), "overview"], async (signal) =>
    await client.rpc(Status).overview({ directory: repository.directory }, { signal }) as Overview))

export const bookmarksQuery = (repository: Repository, client: Client) => queryOptions({
  queryKey: [...jjQueryKey(repository), "bookmarks"], staleTime: 30_000,
  queryFn: async ({ signal }) => await client.rpc(Status).bookmarks({ directory: repository.directory }, { signal }) as string[],
})

export const changedFilesQuery = (repository: Repository, client: Client) => queryOptions({
  queryKey: [...jjQueryKey(repository), "changed-files"], staleTime: 0,
  queryFn: async ({ signal }) => await client.rpc(Status).changedFiles({ directory: repository.directory }, { signal }) as ChangedFile[],
})

export const squashDetailsQuery = (repository: Repository, client: Client, commitID: string) => queryOptions({
  queryKey: [...jjQueryKey(repository), "squash-details", commitID], staleTime: 0,
  queryFn: async ({ signal }) => await client.rpc(Status).squashDetails({ directory: repository.directory, commitID }, { signal }) as SquashDetails,
})

export const revisionFilesQuery = (cache: QueryClient, repository: Repository, client: Client, commitID: string) => queryOptions(
  readQueryOptions<ChangedFile[]>(cache, ["jj-immutable", repository.server, repository.directory, "files", commitID], async (signal) =>
    await client.rpc(Status).revisionFiles({ directory: repository.directory, commitID }, { signal }) as ChangedFile[], { immutable: true }))

export interface DiffData { data: RevisionDiff; files: ReturnType<typeof reuseDiffFiles> }
export function diffQuery(cache: QueryClient, repository: Repository, client: Client, id: string) {
  const target = parseDiffTabID(id)
  if (!target || target.directory !== repository.directory) throw new Error("Invalid diff tab for this repository")
  return queryOptions(readQueryOptions<DiffData>(cache,
    [...jjQueryKey(repository), "diff", target.changeID ? "change" : "commit", target.changeID ?? target.commitID,
      ...(target.againstMain ? ["main"] : [])],
    async (signal, previous) => {
      const knownCommitID = previous?.data.revision.commitID
      const changeID = target.changeID ?? (!previous?.data.revision.divergent ? previous?.data.revision.fullChangeID : undefined)
      const update = await client.rpc(Status).diff({ directory: repository.directory,
         ...(changeID ? { changeID } : { commitID: knownCommitID ?? target.commitID }),
        ...(target.againstMain ? { againstMain: true, knownBaseCommitID: previous?.data.baseCommitID } : {}),
        ...(knownCommitID ? { knownCommitID } : {}) }, { signal }) as RevisionDiff
      signal.throwIfAborted()
      if (update.unchanged && !previous) throw new Error("Missing cached diff. Refresh to load it again.")
      const data = update.unchanged ? { ...update, patch: previous!.data.patch } : update
      const files = previous?.data.patch === data.patch ? previous.files
        : reuseDiffFiles(previous?.files ?? [], parsePatchFiles(data.patch, `${repository.directory}:${data.revision.commitID}`, true).flatMap((patch) => patch.files))
      return { data, files }
    }, { interval: DIFF_POLL_INTERVAL, poll: (value) => !!target.againstMain || !!value?.data.revision.current }))
}

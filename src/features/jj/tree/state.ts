import type { MountedSession } from "@opencode/plugin/gui"
import { createResourceModel } from "../../../shared/gui/resource"
import { Status } from "../rpc"
import type { TreeHistory } from "./model"
import type { ChangedFile } from "../changed-files"
import type { WorktreeSessionSnapshot } from "./worktree-sessions"

type Client = MountedSession["server"]["client"]

export function createHistoryModel(directory: string) {
  const resource = createResourceModel<{ client: Client; limit: number; revision: number }, TreeHistory>(
    async ({ client, limit }, signal) => await client.rpc(Status).tree({ directory, limit }, { signal, location: { directory } }) as TreeHistory,
    { equals: (a, b) => a.client === b.client && a.limit === b.limit && a.revision === b.revision })
  // Independent loading/error state: slow presence queries must not hold the
  // graph hostage. Reuse the history view's refresh cadence, not another timer.
  const positions = createResourceModel<Client, WorktreeSessionSnapshot>(async (client, signal) =>
    await client.rpc(Status).worktreeSessions({ directory }, { signal, location: { directory } }) as WorktreeSessionSnapshot)
  return {
    ...resource, history: resource.result,
    sessionPositions: positions.result,
    refreshPositions: positions.refresh,
    refresh() {
      resource.refresh()
      if (!positions.result.error || Date.now() >= positions.lastFinished() + positions.nextDelay()) positions.refresh()
    },
    invalidate(options?: { defer?: boolean }) {
      resource.invalidate(options)
      positions.invalidate(options)
    },
    configure(client: Client, limit: number, revision: number) {
      resource.configure({ client, limit, revision })
      positions.configure(client)
    },
  }
}

export function createRevisionFilesModel(directory: string, commitID: string) {
  const resource = createResourceModel<Client, ChangedFile[]>(async (client, signal) =>
    await client.rpc(Status).revisionFiles({ directory, commitID }, { signal }) as ChangedFile[])
  return {
    ...resource, files: resource.result,
    configure(client: Client) {
      resource.configure(client)
    },
  }
}

export type HistoryModel = ReturnType<typeof createHistoryModel>
export type RevisionFilesModel = ReturnType<typeof createRevisionFilesModel>

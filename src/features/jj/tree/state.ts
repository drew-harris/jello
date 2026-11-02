import { createLatest, type MountedSession } from "@opencode/plugin/gui"
import { createSignal, untrack } from "solid-js"
import { Status } from "../rpc"
import type { TreeHistory } from "./model"
import type { ChangedFile } from "../changed-files"

type Client = MountedSession["server"]["client"]

export function createHistoryModel(directory: string) {
  const [request, setRequest] = createSignal<{ client: Client; limit: number; revision: number }>()
  const history = createLatest(request, async ({ client, limit }) =>
    await client.rpc(Status).tree({ directory, limit }) as TreeHistory)
  return {
    history,
    configure(client: Client, limit: number, revision: number) {
      const previous = untrack(request)
      if (previous?.client === client && previous.limit === limit && previous.revision === revision) return
      setRequest({ client, limit, revision })
    },
    refresh() { setRequest((previous) => previous && { ...previous }) },
  }
}

export function createRevisionFilesModel(directory: string, commitID: string) {
  const [request, setRequest] = createSignal<{ client: Client }>()
  const files = createLatest(request, async ({ client }) =>
    await client.rpc(Status).revisionFiles({ directory, commitID }) as ChangedFile[])
  return {
    files,
    configure(client: Client) {
      if (untrack(request)?.client !== client) setRequest({ client })
    },
    refresh() { setRequest((previous) => previous && { ...previous }) },
  }
}

export type HistoryModel = ReturnType<typeof createHistoryModel>
export type RevisionFilesModel = ReturnType<typeof createRevisionFilesModel>

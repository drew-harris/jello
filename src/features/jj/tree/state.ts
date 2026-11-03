import type { MountedSession } from "@opencode/plugin/gui"
import { createResourceModel } from "../../../shared/gui/resource"
import { Status } from "../rpc"
import type { TreeHistory } from "./model"
import type { ChangedFile } from "../changed-files"

type Client = MountedSession["server"]["client"]

export function createHistoryModel(directory: string) {
  const resource = createResourceModel<{ client: Client; limit: number; revision: number }, TreeHistory>(
    async ({ client, limit }, signal) => await client.rpc(Status).tree({ directory, limit }, { signal }) as TreeHistory,
    { equals: (a, b) => a.client === b.client && a.limit === b.limit && a.revision === b.revision })
  return {
    ...resource, history: resource.result,
    configure(client: Client, limit: number, revision: number) {
      resource.configure({ client, limit, revision })
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

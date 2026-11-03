import type { MountedSession } from "@opencode/plugin/gui"
import { createResourceModel } from "../../shared/gui/resource"
import { Status } from "./rpc"
import type { Overview } from "./overview"

export function createStatusModel(directory: string) {
  return createResourceModel<MountedSession["server"]["client"], Overview>(async (client, signal) =>
    await client.rpc(Status).overview({ directory }, { signal }) as Overview)
}
export type StatusModel = ReturnType<typeof createStatusModel>

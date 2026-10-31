import type { Plugin } from "@opencode/plugin"
import { Status } from "./rpc.ts"
import { readOverview, readStatus } from "./status.ts"
import { commit } from "./commit.ts"
import { readRevisionDiff } from "./diff/server.ts"

export async function setupJJ(ctx: Plugin.Context) {
  await ctx.rpc.register(Status, {
    diff: async (input, context) => {
      const { directory, commitID } = input as { directory: string; commitID: string }
      return readRevisionDiff(directory, commitID, context.signal)
    },
    commit: async (input, context) => {
      const { directory, message } = input as { directory: string; message: string }
      await commit(directory, message, context.signal)
      return { committed: true }
    },
    overview: async (input, context) => {
      const { directory } = input as { directory: string }
      return readOverview(directory, context.signal)
    },
    status: async (input, context) => {
      const { directory } = input as { directory: string }
      return readStatus(directory, context.signal)
    },
  })
}

import type { Plugin } from "@opencode/plugin"
import { Status } from "./rpc.ts"
import { readOverview, readStatus } from "./status.ts"
import { commit } from "./commit.ts"
import { readRevisionDiff } from "./diff/server.ts"
import { readChangedFiles } from "./changed-files.ts"
import { readTree } from "./tree/server.ts"
import { abandon } from "./tree/abandon.ts"
import { describe } from "./tree/describe.ts"
import { newChange } from "./tree/new.ts"
import { listBookmarks, setBookmark } from "./tree/bookmarks.ts"
import { editChange } from "./tree/edit.ts"

export async function setupJJ(ctx: Plugin.Context) {
  await ctx.rpc.register(Status, {
    edit: async (input, context) => {
      const { directory, commitID } = input as { directory: string; commitID: string }
      await editChange(directory, commitID, context.signal)
      return { edited: true }
    },
    bookmarks: async (input, context) => {
      const { directory } = input as { directory: string }
      return listBookmarks(directory, context.signal)
    },
    setBookmark: async (input, context) => {
      const { directory, commitID, name } = input as { directory: string; commitID: string; name: string }
      await setBookmark(directory, commitID, name, context.signal)
      return { set: true }
    },
    revisionFiles: async (input, context) => {
      const { directory, commitID } = input as { directory: string; commitID: string }
      return readChangedFiles(directory, context.signal, commitID)
    },
    newChange: async (input, context) => {
      const { directory, commitID } = input as { directory: string; commitID?: string }
      await newChange(directory, context.signal, commitID)
      return { created: true }
    },
    describe: async (input, context) => {
      const { directory, commitID, message } = input as { directory: string; commitID: string; message: string }
      await describe(directory, commitID, message, context.signal)
      return { described: true }
    },
    abandon: async (input, context) => {
      const { directory, commitID } = input as { directory: string; commitID: string }
      await abandon(directory, commitID, context.signal)
      return { abandoned: true }
    },
    tree: async (input, context) => {
      const { directory, limit } = input as { directory: string; limit: number }
      return readTree(directory, limit, context.signal)
    },
    changedFiles: async (input, context) => {
      const { directory } = input as { directory: string }
      return readChangedFiles(directory, context.signal)
    },
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

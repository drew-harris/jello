import type { Plugin } from "@opencode/plugin"
import { Status } from "./rpc.ts"
import { readOverview, readStatus } from "./status.ts"
import { commit } from "./commit.ts"
import { readDiffContext, readRevisionDiff } from "./diff/server.ts"
import { readChangedFiles } from "./changed-files.ts"
import { readTree } from "./tree/server.ts"
import { abandon } from "./tree/abandon.ts"
import { describe } from "./tree/describe.ts"
import { newChange } from "./tree/new.ts"
import { listBookmarks, setBookmark } from "./tree/bookmarks.ts"
import { editChange } from "./tree/edit.ts"
import { readSquashDetails, squashBelow } from "./tree/squash.ts"
import { pushChange } from "./tree/push.ts"

export async function setupJJ(ctx: Plugin.Context) {
  await ctx.rpc.register(Status, {
    diffContext: async (input, context) => {
      const { directory, commitID, path } = input as { directory: string; commitID: string; path: string }
      return readDiffContext(directory, commitID, path, context.signal)
    },
    gitPush: async (input, context) => {
      const { directory, commitID } = input as { directory: string; commitID: string }
      await pushChange(directory, commitID, context.signal)
      return { pushed: true }
    },
    squashDetails: async (input, context) => {
      const { directory, commitID } = input as { directory: string; commitID: string }
      return readSquashDetails(directory, commitID, context.signal)
    },
    squashBelow: async (input, context) => {
      const { directory, commitID, parentID, message } = input as { directory: string; commitID: string; parentID: string; message?: string }
      await squashBelow(directory, commitID, parentID, message, context.signal)
      return { squashed: true }
    },
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
      const { directory, commitID, changeID, knownCommitID } = input as { directory: string; commitID?: string; changeID?: string; knownCommitID?: string }
      if (commitID && changeID) throw new Error("Supply a commit ID or change ID, not both.")
      return readRevisionDiff(directory, changeID ?? commitID ?? "", context.signal, knownCommitID)
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

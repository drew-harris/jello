import type { Context, MountedSession } from "@opencode/plugin/gui"
import { createAsyncAction } from "../../shared/gui/async-action"
import { Intelligence } from "./rpc"

export function createLanguageRestart(ctx: Context) {
  const action = createAsyncAction({ toast: ctx.toast })
  return {
    pending: action.pending,
    async run(session: MountedSession) {
      const directory = session.directory
      const client = session.server.client
      await action.run(async () => { await client.rpc(Intelligence).restart({ directory }) }, {
        progress: "Restarting TypeScript language server…",
        success: "TypeScript language server restarted",
        successDescription: "LSP state cleared. The next lookup will reload the project.",
        failure: "Could not restart TypeScript language server",
      })
    },
  }
}

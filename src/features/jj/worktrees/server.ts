import { realpath } from "node:fs/promises"
import type { Plugin } from "@opencode/plugin"
import { createJJWorktreeStrategy } from "./strategy.ts"
import { worktreeOptions } from "./options.ts"
import { contains, jjRepository, missing } from "./repository.ts"

export async function setupJJWorktrees(ctx: Plugin.Context) {
  const options = worktreeOptions(ctx.options.jjWorktrees)
  if (!options) return
  const canonical = ctx.location.project.canonical
  if (!await jjRepository(canonical)) return
  const strategy = createJJWorktreeStrategy(canonical, options, async (directory, signal) => {
    // The plugin context intentionally omits session.active. Inspect durable
    // busy/idle markers a page at a time; don't load a large project's entire
    // session history into memory or confuse an idle open tab with active work.
    let cursor: string | undefined
    do {
      const page = await ctx.session.list(cursor ? { cursor, limit: 100 } : { project: ctx.location.project.id, limit: 100 }, { signal })
      for (const session of page.data) {
        signal.throwIfAborted()
        if ((session.time.busy ?? 0) <= (session.time.idle ?? 0)) continue
        let path: string
        try { path = await realpath(session.location.directory) } catch (error) { if (missing(error)) continue; throw error }
        if (contains(directory, path)) {
          throw new Error("A running OpenCode session is using this JJ workspace. Stop or move it before removing the workspace.")
        }
      }
      cursor = page.cursor.next ?? undefined
    } while (cursor)
  })
  await ctx.worktree.transform((editor) => editor.add(ctx.location.project.id === "global" ? {
    ...strategy,
    async create() {
      throw new Error("OpenCode has not identified this JJ project yet. Create an initial commit and reopen/reload the project before creating native worktrees.")
    },
  } : strategy))
}

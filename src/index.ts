import { Plugin } from "@opencode/plugin"
import { Hello } from "./rpc.ts"
import { setupJJ } from "./features/jj/server.ts"
import { setupIntelligence } from "./features/intelligence/server.ts"
import { setupJJWorktrees } from "./features/jj/worktrees/server.ts"

// Server part: runs in the OpenCode server. Its id is also the GUI's id (ctx.id).
export default Plugin.define({
  id: "jello",
  async setup(ctx) {
    await setupJJ(ctx)
    await setupJJWorktrees(ctx)
    const cleanupIntelligence = await setupIntelligence(ctx)
    await ctx.rpc.register(Hello, {
      greet: async (input) => {
        const { name } = input as { name: string }

        return { text: `Hello ${name}, from the Jello server part (OpenCode ${ctx.app.version}).` }
      },
    })
    return cleanupIntelligence
  },
})

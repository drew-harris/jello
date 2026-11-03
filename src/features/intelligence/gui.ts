import { Command, Style, type Plugin } from "@opencode/plugin/gui"
import type { definition } from "../../gui/definition"
import { createLanguageRestart } from "./restart"
import css from "./style.css?inline"

export const setupIntelligence: Plugin.Setup<typeof definition> = (ctx) => {
  ctx.add(Style, css)
  const restart = createLanguageRestart(ctx)
  ctx.add(Command, () => ({
    // Preserve the published command ID and saved keybindings.
    id: "jj-lsp-restart",
    title: "Restart TypeScript language server",
    group: "JJ Diff",
    keywords: "lsp reset clear cache intellisense references definition",
    enabled: !!ctx.sessions.current() && !restart.pending(),
    run: async () => {
      const session = ctx.sessions.current()
      if (session) await restart.run(session)
    },
  }))
}

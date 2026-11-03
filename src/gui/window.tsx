import { Command, SettingsPage, Style, Theme, type Plugin } from "@opencode/plugin/gui"
import { sonokai } from "./themes/sonokai"
import { setupJJ } from "../features/jj/gui"
import type { definition } from "./definition"
import { SettingsView } from "./settings"
import css from "./style.css?inline"
import { createRepositoryServices, RepositoryServices } from "../shared/gui/repository"
import { setupIntelligence } from "../features/intelligence/gui"

// Shared Jello window setup. Each feature registers its own contributions.
export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  ctx.add(Theme, sonokai)
  ctx.provide(RepositoryServices, createRepositoryServices())
  setupIntelligence(ctx)
  ctx.add(Style, css)
  setupJJ(ctx)

  ctx.add(Command, (): Command => ({
    id: "hello",
    title: "Say hello from Jello",
    group: "Jello",
    slash: { name: "jello-hello" },
    run: () => {
      ctx.toast.show({
        variant: "success",
        title: `${ctx.stores.prefs.value.greeting} from Jello!`,
      })
    },
  }))

  ctx.add(SettingsPage, {
    id: ctx.id,
    icon: "extensions",
    title: "Jello",
    entries: [
      { id: "font-size", title: "Diff code font size", description: "Change the code font size in the JJ diff panel.", keywords: "diff code text font size" },
    ],
    render: (input) => <SettingsView highlight={input.target} />,
  })
}

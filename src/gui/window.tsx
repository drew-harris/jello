import { Command, SettingsPage, Style, type Plugin } from "@opencode/plugin/gui"
import { setupJJ } from "../features/jj/gui"
import type { definition } from "./definition"
import { SettingsView } from "./settings"
import css from "./style.css?inline"

// Shared Jello window setup. Each feature registers its own contributions.
export const setup: Plugin.Setup<typeof definition> = (ctx) => {
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
      { id: "greeting", title: "Greeting" },
    ],
    render: (input) => <SettingsView highlight={input.target} />,
  })
}

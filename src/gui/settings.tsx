import { usePlugin } from "@opencode/plugin/gui"
import type { definition } from "./definition"

// The plugin's page under Settings. ctx.stores.prefs is a Store.global declared in definition.ts.
export function SettingsView(_props: { readonly highlight?: string }) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const prefs = ctx.stores.prefs

  return (
    <div class="jello-settings">
      <ui.TextInput
        label="Greeting"
        value={prefs.value.greeting}
        onInput={(greeting) =>
          prefs.update((draft) => {
            draft.greeting = greeting
          })
        }
      />
    </div>
  )
}

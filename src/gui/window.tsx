import {
  Command,
  MenuItem,
  Panel,
  SettingsPage,
  Style,
  TitlebarItem,
  type PanelTab,
  type Plugin,
} from "@opencode/plugin/gui"
import type { definition } from "./definition"
import { PanelView } from "./panel"
import { SettingsView } from "./settings"
import css from "./style.css?inline"

// Runs in every desktop app window. Keep it synchronous and light: register contributions here,
// and do expensive work inside components, createKeyed, or createLatest.
export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  // Panel keys are "<plugin id>:<tab id>".
  const key = `${ctx.id}:main`

  const toggle = () => {
    const session = ctx.sessions.current()

    if (session) ctx.layout.toggle(key, session)
  }

  ctx.add(Style, css)

  // Return the same tab object while it is unchanged, and read its labels from getters.
  const tab: PanelTab = {
    id: "main",
    get title() {
      return ctx.t("panel.title")
    },
    closable: "compact",
    fallback: true,
  }

  ctx.add(Panel, {
    id: "main",
    region: "side",
    mobile: {
      get title() {
        return ctx.t("panel.title")
      },
      order: 50,
      kind: "menu",
      icon: "extensions",
    },
    list: (input) => (input.open.includes("main") ? [tab] : []),
    render: (props) => <PanelView session={props.session} />,
  })

  // Published as "<plugin id>.toggle" in the command palette and Settings > Shortcuts.
  ctx.add(
    Command,
    (): Command => ({
      id: "toggle",
      title: ctx.t("command.toggle"),
      group: ctx.t("title"),
      section: "session",
      enabled: !!ctx.sessions.current(),
      run: toggle,
    }),
  )

  ctx.add(
    Command,
    (): Command => ({
      id: "hello",
      title: ctx.t("command.hello"),
      group: ctx.t("title"),
      slash: { name: "jello-hello" },
      run: () => {
        ctx.toast.show({
          variant: "success",
          title: ctx.t("toast.hello", { greeting: ctx.stores.prefs.value.greeting }),
        })
      },
    }),
  )

  // A launcher in the side panel's + menu and its New tab view.
  ctx.add(MenuItem, (): MenuItem => {
    const session = ctx.sessions.current()

    return {
      menu: "session.panel",
      id: "open",
      title: ctx.t("panel.title"),
      icon: "extensions",
      keybind: `${ctx.id}.toggle`,
      opened: !!session && ctx.layout.state(key, session) !== "closed",
      run: () => {
        if (session) ctx.layout.open(key, session)
      },
    }
  })

  // A titlebar pill that follows the stored preference; returning undefined withdraws it.
  ctx.add(TitlebarItem, (): TitlebarItem | undefined =>
    ctx.stores.prefs.value.showStatus
      ? { id: "status", label: ctx.t("status.label"), icon: "extensions", run: toggle }
      : undefined,
  )

  ctx.add(SettingsPage, {
    id: ctx.id,
    icon: "extensions",
    get title() {
      return ctx.t("settings.title")
    },
    get entries() {
      return [
        { id: "greeting", title: ctx.t("settings.greeting") },
        { id: "status", title: ctx.t("settings.status"), keywords: "titlebar pill" },
      ]
    },
    render: (input) => <SettingsView highlight={input.target} />,
  })
}

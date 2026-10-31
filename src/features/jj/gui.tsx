import { Command, MenuItem, Panel, Slot, Style, TitlebarItem, type PanelTab, type Plugin } from "@opencode/plugin/gui"
import { createSignal } from "solid-js"
import type { definition } from "../../gui/definition"
import { PanelView } from "./panel"
import { StatusBar } from "./status-bar"
import { CommitDialog } from "./commit-dialog"
import { Status } from "./rpc"
import { setupDiff } from "./diff/gui"
import css from "./style.css?inline"
import treeCSS from "./tree/style.css?inline"
import type { ChangedFile } from "./changed-files"

// All JJ window contributions live here; the Jello shell only composes features.
export const setupJJ: Plugin.Setup<typeof definition> = (ctx) => {
  setupDiff(ctx)
  const key = `${ctx.id}:jj`
  const [revision, setRevision] = createSignal(0)
  const open = () => {
    const session = ctx.sessions.current()
    if (!session) return
    setRevision((value) => value + 1)
    ctx.layout.open(key, session)
  }
  const toggle = () => {
    const session = ctx.sessions.current()
    if (session) ctx.layout.toggle(key, session)
  }

  ctx.add(Command, (): Command => ({
    id: "jj.commit",
    title: "Commit",
    group: "JJ",
    section: "session",
    slash: { name: "commit" },
    enabled: !!ctx.sessions.current(),
    run: () => {
      const session = ctx.sessions.current()
      if (!session) return
      const directory = session.directory
      const client = session.server.client
      ctx.dialogs.open((dialog) => <CommitDialog
        directory={directory}
        close={dialog.close}
        onCommitted={() => setRevision((value) => value + 1)}
        commit={async (message) => { await client.rpc(Status).commit({ directory, message }) }}
        loadFiles={async () => await client.rpc(Status).changedFiles({ directory }) as ChangedFile[]}
      />)
    },
  }))

  ctx.add(Style, css)
  ctx.add(Style, treeCSS)
  ctx.add(Slot, { at: "window.bottom", render: () => <StatusBar revision={revision()} /> })

  const tab: PanelTab = {
    id: "jj",
    title: "JJ Tree",
    closable: "compact",
    fallback: true,
  }
  ctx.add(Panel, {
    id: "jj",
    region: "side",
    mobile: {
      title: "JJ Tree",
      order: 50,
      kind: "menu",
      icon: "extensions",
    },
    list: (input) => input.open.includes("jj") ? [tab] : [],
    render: (props) => <PanelView session={props.session} revision={revision()} />,
  })
  ctx.add(Command, (): Command => ({
    id: "jj.open",
    title: "Open JJ Tree",
    keywords: "tree log history commits graph",
    group: "JJ",
    section: "session",
    slash: { name: "tree" },
    enabled: !!ctx.sessions.current(),
    run: open,
  }))
  ctx.add(Command, (): Command => ({
    id: "jj.tree",
    title: "Open JJ Tree",
    hidden: true,
    group: "JJ",
    section: "session",
    slash: { name: "jj" },
    enabled: !!ctx.sessions.current(),
    run: open,
  }))
  ctx.add(Command, (): Command => ({
    id: "jj.toggle",
    title: "Toggle JJ Tree panel",
    group: "JJ",
    section: "session",
    enabled: !!ctx.sessions.current(),
    run: toggle,
  }))
  ctx.add(MenuItem, (): MenuItem => {
    const session = ctx.sessions.current()
    return {
      menu: "session.panel",
      id: "jj.open",
      title: "JJ Tree",
      icon: "extensions",
      keybind: `${ctx.id}.jj.toggle`,
      opened: !!session && ctx.layout.state(key, session) !== "closed",
      run: open,
    }
  })
  ctx.add(TitlebarItem, (): TitlebarItem | undefined =>
    ctx.stores.prefs.value.showStatus
      ? { id: "jj.status", label: "JJ", icon: "extensions", run: toggle }
      : undefined,
  )
}

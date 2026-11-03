import { Command, MenuItem, Panel, Slot, Style, type PanelTab, type Plugin } from "@opencode/plugin/gui"
import { createSignal, Show } from "solid-js"
import type { definition } from "../../gui/definition"
import { PanelView } from "./panel"
import { StatusBar } from "./status-bar"
import { CommitDialog } from "./commit-dialog"
import { Status } from "./rpc"
import { setupDiff } from "./diff/gui"
import css from "./style.css?inline"
import treeCSS from "./tree/style.css?inline"
import type { ChangedFile } from "./changed-files"
import { repositoryViewKey, ViewModels } from "../../shared/gui/view-models"
import { createHistoryModel, type HistoryModel, type RevisionFilesModel } from "./tree/state"
import { repositoryServices, sessionRepository } from "../../shared/gui/repository"
import { JJ_CHANGED } from "./invalidation"
import type { StatusModel } from "./status-model"

// All JJ window contributions live here; the Jello shell only composes features.
export const setupJJ: Plugin.Setup<typeof definition> = (ctx) => {
  setupDiff(ctx)
  const historyModels = new ViewModels<HistoryModel>()
  const filesModels = new ViewModels<RevisionFilesModel>(100)
  const statusModels = new ViewModels<StatusModel>()
  const repositories = repositoryServices(ctx)
  const key = `${ctx.id}:jj`
  const [focusRequest, setFocusRequest] = createSignal(0)
  const open = () => {
    const session = ctx.sessions.current()
    if (!session) return
    const saved = ctx.stores.jjTree(session).value
    const limit = saved?.directory === session.directory ? saved.limit : 100
    historyModels.preload(repositoryViewKey(session.server.id, session.directory), () => createHistoryModel(session.directory), (model) => {
      model.configure(session.server.client, limit, 0)
      if (model.history.latest || model.history.error) model.refresh()
    })
    ctx.layout.open(key, session)
    setFocusRequest((value) => value + 1)
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
      const repository = sessionRepository(session)
      ctx.dialogs.open((dialog) => <CommitDialog
        directory={directory}
        close={dialog.close}
        onCommitted={() => repositories.events.invalidate(repository, JJ_CHANGED)}
        commit={async (message) => {
          const release = repositories.gate(repository).acquire()
          try { await client.rpc(Status).commit({ directory, message }) } finally { release() }
        }}
        loadFiles={async () => await client.rpc(Status).changedFiles({ directory }) as ChangedFile[]}
      />)
    },
  }))

  ctx.add(Style, css)
  ctx.add(Style, treeCSS)
  ctx.add(Slot, {
    at: "window.bottom",
    render: () => <Show when={ctx.stores.prefs.value.showStatusBar}><StatusBar models={statusModels} /></Show>,
  })
  ctx.add(Command, {
    id: "jj.status.toggle",
    title: "Toggle JJ status bar",
    keywords: "bottom footer show hide visibility",
    group: "JJ",
    run: () => {
      ctx.stores.prefs.update((draft) => {
        draft.showStatusBar = !draft.showStatusBar
      })
    },
  })

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
    render: (props) => <PanelView session={props.session} models={historyModels} filesModels={filesModels} focusRequest={focusRequest()} />,
    enter: () => setFocusRequest((value) => value + 1),
  })
  ctx.add(Command, (): Command => ({
    id: "jj.open",
    title: "Open JJ Tree",
    bind: "mod+shift+j",
    editable: true,
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
  ctx.add(MenuItem, (): MenuItem => {
    const session = ctx.sessions.current()
    return {
      menu: "session.panel",
      id: "jj.open",
      title: "JJ Tree",
      icon: "extensions",
      keybind: `${ctx.id}.jj.open`,
      opened: !!session && ctx.layout.state(key, session) !== "closed",
      run: open,
    }
  })
}

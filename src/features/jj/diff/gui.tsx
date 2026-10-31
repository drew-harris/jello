import { Panel, Style, type PanelTab, type Plugin } from "@opencode/plugin/gui"
import type { definition } from "../../../gui/definition"
import { parseDiffTabID } from "./tab"
import { DiffView } from "./view"
import css from "./style.css?inline"
import { registerDiffThemes } from "./theme"

export const setupDiff: Plugin.Setup<typeof definition> = (ctx) => {
  registerDiffThemes()
  ctx.add(Style, css)
  const tabs = new Map<string, PanelTab>()
  ctx.add(Panel, {
    id: "jj-diff",
    region: "side",
    list: ({ open }) => open.flatMap((id) => {
      const target = parseDiffTabID(id)
      if (!target) return []
      let tab = tabs.get(id)
      if (!tab) {
        tab = { id, title: `JJ Diff · ${target.commitID.slice(0, 7)}`, closable: "compact", tabbable: true }
        tabs.set(id, tab)
      }
      return [tab]
    }),
    render: (props) => <DiffView session={props.session} tabID={props.tab.id} />,
    close: ({ tab }) => { tabs.delete(tab.id) },
  })
}

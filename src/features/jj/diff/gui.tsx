import { Panel, Style, type PanelTab, type Plugin } from "@opencode/plugin/gui"
import type { definition } from "../../../gui/definition"
import { parseDiffTabID } from "./tab"
import { DiffView } from "./view"
import css from "./style.css?inline"
import { registerDiffThemes } from "./theme"
import { createSignal } from "solid-js"

export const setupDiff: Plugin.Setup<typeof definition> = (ctx) => {
  registerDiffThemes()
  ctx.add(Style, css)
  const tabs = new Map<string, PanelTab>()
  const [focused, setFocused] = createSignal({ id: "", revision: 0 })
  ctx.add(Panel, {
    id: "jj-diff",
    region: "side",
    list: ({ open }) => open.flatMap((id) => {
      const target = parseDiffTabID(id)
      if (!target) return []
      let tab = tabs.get(id)
      if (!tab) {
        const file = target.file?.split("/").at(-1)
        tab = { id, title: `JJ Diff · ${file ? `${file} · ` : ""}${target.commitID.slice(0, 7)}`, closable: "compact", tabbable: true }
        tabs.set(id, tab)
      }
      return [tab]
    }),
    render: (props) => <DiffView session={props.session} tabID={props.tab.id}
      focusRevision={focused().id === props.tab.id ? focused().revision : 0} />,
    focus: ({ tab }) => {
      setFocused((previous) => ({ id: tab.id, revision: previous.revision + 1 }))
    },
    close: ({ tab }) => { tabs.delete(tab.id) },
  })
}

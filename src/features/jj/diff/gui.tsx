import { Panel, Style, type PanelTab, type Plugin } from "@opencode/plugin/gui"
import type { definition } from "../../../gui/definition"
import { diffTabTitle, parseDiffTabID, type DiffTabRevision } from "./tab"
import { DiffView } from "./view"
import css from "./style.css?inline"
import { registerDiffThemes } from "./theme"
import { createSignal } from "solid-js"

export const setupDiff: Plugin.Setup<typeof definition> = (ctx) => {
  registerDiffThemes()
  ctx.add(Style, css)
  const tabs = new Map<string, PanelTab>()
  const [revisions, setRevisions] = createSignal<Record<string, DiffTabRevision>>({})
  const updateRevision = (id: string, revision: DiffTabRevision) => {
    if (!tabs.has(id)) return
    setRevisions((previous) => {
      const saved = previous[id]
      if (saved?.current === revision.current && saved.changeID8 === revision.changeID8) return previous
      return { ...previous, [id]: { current: revision.current, changeID8: revision.changeID8 } }
    })
  }
  const [focused, setFocused] = createSignal({ id: "", revision: 0 })
  ctx.add(Panel, {
    id: "jj-diff",
    region: "side",
    list: ({ open }) => open.flatMap((id) => {
      const target = parseDiffTabID(id)
      if (!target) return []
      let tab = tabs.get(id)
      if (!tab) {
        tab = { id, get title() { return diffTabTitle(revisions()[id]) }, closable: "compact", tabbable: true }
        tabs.set(id, tab)
      }
      return [tab]
    }),
    render: (props) => <DiffView session={props.session} tabID={props.tab.id}
      onRevision={updateRevision}
      focusRevision={focused().id === props.tab.id ? focused().revision : 0} />,
    focus: ({ tab }) => {
      setFocused((previous) => ({ id: tab.id, revision: previous.revision + 1 }))
    },
    close: ({ tab }) => {
      tabs.delete(tab.id)
      setRevisions((previous) => {
        const next = { ...previous }
        delete next[tab.id]
        return next
      })
    },
  })
}

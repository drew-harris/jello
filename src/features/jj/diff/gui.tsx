import { Panel, Style, type PanelTab, type Plugin } from "@opencode/plugin/gui"
import type { definition } from "../../../gui/definition"
import { diffTabTitle, parseDiffTabID, reusableDiffTab, type DiffTabRevision } from "./tab"
import { DiffNavigation, diffSessionKey } from "./navigation"
import { DiffView } from "./view"
import css from "./style.css?inline"
import { registerDiffThemes } from "./theme"
import { createSignal } from "solid-js"

export const setupDiff: Plugin.Setup<typeof definition> = (ctx) => {
  registerDiffThemes()
  ctx.add(Style, css)
  const tabs = new Map<string, PanelTab>()
  const scoped = (session: string, id: string) => `${session}\0${id}`
  const [revisions, setRevisions] = createSignal<Record<string, DiffTabRevision>>({})
  const updateRevision = (session: string, id: string, revision: DiffTabRevision) => {
    const key = scoped(session, id)
    if (!tabs.has(key)) return
    setRevisions((previous) => {
      const saved = previous[key]
      if (saved?.current === revision.current && saved.changeID8 === revision.changeID8
        && saved.commitID === revision.commitID && saved.divergent === revision.divergent && saved.fullChangeID === revision.fullChangeID) return previous
      return { ...previous, [key]: { ...revision } }
    })
  }
  const [focused, setFocused] = createSignal<{ session: string; id: string; revision: number; file?: string }>({ session: "", id: "", revision: 0 })
  ctx.provide(DiffNavigation, {
    open(session, target) {
      const sessionKey = diffSessionKey(session)
      const stored = ctx.layout.stored(session)
      const metadata: Record<string, DiffTabRevision> = {}
      for (const id of stored) {
        const revision = revisions()[scoped(sessionKey, id)]
        if (revision) metadata[id] = revision
      }
      const id = reusableDiffTab(stored, target, metadata)
      setFocused((previous) => ({ session: sessionKey, id, file: target.file, revision: previous.revision + 1 }))
      ctx.layout.open(`${ctx.id}:${id}`, session, { tab: "select" })
    },
  })
  ctx.add(Panel, {
    id: "jj-diff",
    region: "side",
    list: ({ open, session }) => open.flatMap((id) => {
      const target = parseDiffTabID(id)
      if (!target) return []
      const key = scoped(diffSessionKey(session), id)
      let tab = tabs.get(key)
      if (!tab) {
        tab = { id, get title() { return diffTabTitle(revisions()[key]) }, closable: "compact", tabbable: true }
        tabs.set(key, tab)
      }
      return [tab]
    }),
    render: (props) => <DiffView session={props.session} tabID={props.tab.id}
      onRevision={(id, revision) => updateRevision(diffSessionKey(props.session), id, revision)}
      requestedFile={focused().id === props.tab.id && focused().session === diffSessionKey(props.session) ? focused().file : undefined}
      focusRevision={focused().id === props.tab.id && focused().session === diffSessionKey(props.session) ? focused().revision : 0} />,
    focus: ({ tab, session }) => {
      const key = diffSessionKey(session)
      setFocused((previous) => ({ session: key, id: tab.id, revision: previous.revision + 1,
        file: previous.id === tab.id && previous.session === key ? previous.file : undefined }))
    },
    close: ({ tab, session }) => {
      const key = scoped(diffSessionKey(session), tab.id)
      tabs.delete(key)
      setRevisions((previous) => {
        const next = { ...previous }
        delete next[key]
        return next
      })
    },
  })
}

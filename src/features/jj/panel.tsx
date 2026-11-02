import { Show, Suspense } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { TreeView } from "./tree/view"
import type { ViewModels } from "./view-models"
import type { HistoryModel, RevisionFilesModel } from "./tree/state"

// Read props.session reactively: the panel stays mounted across sessions.
export function PanelView(props: { readonly session: MountedSession; models: ViewModels<HistoryModel>; filesModels: ViewModels<RevisionFilesModel>; readonly revision: number; readonly focusRequest: number; onChanged(): void }) {
  const ctx = usePlugin()
  return <section class="jello-jj-tree" aria-label="JJ commit history" data-mode={ctx.appearance.mode()}
    style={{ "--tree-mono": ctx.appearance.font("mono") }}>
    <Suspense fallback={<div class="jello-jj-tree-empty" role="status">Loading history…</div>}>
      <Show keyed when={`${props.session.server.id}:${props.session.directory}`}>
        {(_key) => <TreeView session={props.session} models={props.models} filesModels={props.filesModels} revision={props.revision} focusRequest={props.focusRequest} onChanged={props.onChanged} />}
      </Show>
    </Suspense>
  </section>
}

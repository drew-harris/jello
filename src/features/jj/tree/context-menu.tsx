import { For } from "solid-js"
import { Portal } from "solid-js/web"
import { usePlugin } from "@opencode/plugin/gui"
import { createContextMenu } from "../../../shared/gui/context-menu"
import type { Action } from "../../../shared/gui/action"
import type { TreeCommit } from "./model"

export function ChangeContextMenu(props: {
  x: number
  y: number
  target: TreeCommit
  actions: Action<TreeCommit>[]
  close(restoreFocus?: boolean): void
}) {
  const ctx = usePlugin()
  const ui = ctx.ui
  let menu!: HTMLDivElement
  const keydown = createContextMenu(() => menu, props)
  return <Portal>
    <div ref={menu} class="jello-jj-tree-context-menu" data-mode={ctx.appearance.mode()}
      role="menu" aria-label="Change actions" tabIndex={-1}
      style={{ left: `${props.x}px`, top: `${props.y}px` }}
      onContextMenu={(event) => event.preventDefault()} onKeyDown={keydown}>
      <For each={props.actions}>{(action) => <button type="button" role="menuitem"
        disabled={!!action.disabledReason(props.target)} classList={{ "is-danger": action.danger }}
        title={action.disabledReason(props.target) ?? action.description} onClick={() => void action.run(props.target, "menu")}>
        <span aria-hidden="true"><ui.Icon name={action.icon} size="small" /></span><span class="jello-jj-tree-menu-label">{action.label}</span>
      </button>}</For>
    </div>
  </Portal>
}

import { Show } from "solid-js"
import { Portal } from "solid-js/web"
import { usePlugin } from "@opencode/plugin/gui"
import type { PeekKind } from "./rpc"
import { createContextMenu } from "../../shared/gui/context-menu"

export function SymbolContextMenu(props: {
  x: number
  y: number
  symbol: string
  disabledReason: string
  close(restoreFocus?: boolean): void
  open(kind: PeekKind): void
  restart(): void
  restarting: boolean
}) {
  const ctx = usePlugin()
  const ui = ctx.ui
  let menu!: HTMLDivElement
  const keydown = createContextMenu(() => menu, props)
  return <Portal><div ref={menu} class="jello-symbol-menu" data-mode={ctx.appearance.mode()}
    role="menu" aria-label={`Symbol actions for ${props.symbol}`} tabIndex={-1}
    style={{ left: `${props.x}px`, top: `${props.y}px` }}
    onContextMenu={(event) => event.preventDefault()}
    onKeyDown={(event) => {
      keydown(event)
      if (event.key === "F12" && !props.disabledReason) {
        event.preventDefault()
        event.stopPropagation()
        props.open(event.shiftKey ? "references" : "definition")
      }
    }}>
    <div class="jello-symbol-menu-title">{props.symbol}</div>
    <button type="button" role="menuitem" disabled={!!props.disabledReason} title={props.disabledReason || "Peek definition (F12)"}
      onClick={() => props.open("definition")}>
      <span aria-hidden="true"><ui.Icon name="code" size="small" /></span><span>Peek definition</span><kbd>F12</kbd>
    </button>
    <button type="button" role="menuitem" disabled={!!props.disabledReason} title={props.disabledReason || "Peek references (Shift+F12)"}
      onClick={() => props.open("references")}>
      <span aria-hidden="true"><ui.Icon name="bullet-list" size="small" /></span><span>Peek references</span><kbd>⇧F12</kbd>
    </button>
    <Show when={props.disabledReason}><p>{props.disabledReason}</p></Show>
    <hr />
    <button type="button" role="menuitem" disabled={props.restarting} onClick={props.restart}>
      <span aria-hidden="true"><ui.Icon name="arrow-undo-down" size="small" /></span><span>Restart TypeScript language server</span>
    </button>
  </div></Portal>
}

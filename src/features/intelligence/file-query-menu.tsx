import { For } from "solid-js"
import { Portal } from "solid-js/web"
import { usePlugin } from "@opencode/plugin/gui"
import { createContextMenu } from "../../shared/gui/context-menu"
import { navigationQueries, type FileQuery } from "./queries"

export function FileQueryMenu(props: {
  x: number; y: number; symbol: string; disabled: boolean
  run(kind: FileQuery): void
  close(restoreFocus?: boolean): void
  mount?: HTMLElement
}) {
  const ctx = usePlugin()
  let menu!: HTMLDivElement
  const keydown = createContextMenu(() => menu, props)
  return <Portal mount={props.mount}><div ref={menu} class="jello-symbol-menu" data-mode={ctx.appearance.mode()}
    role="menu" aria-label={`Source actions for ${props.symbol}`} tabindex={-1}
    style={{ left: `${props.x}px`, top: `${props.y}px` }} onKeyDown={(event) => {
      keydown(event)
      event.stopPropagation()
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
      const query = event.key === "F12" ? event.shiftKey ? "references" : "definition"
        : event.key === "K" && event.shiftKey ? "hover" : undefined
      if (!query) return
      event.preventDefault()
      if (!props.disabled) props.run(query)
    }} onContextMenu={(event) => event.preventDefault()}>
    <div class="jello-symbol-menu-title">{props.symbol}</div>
    <For each={navigationQueries}>{(query) => <button type="button" role="menuitem" disabled={props.disabled} onClick={() => props.run(query.kind)}>
      <span>{query.label}</span><kbd>{query.shortcut}</kbd>
    </button>}</For>
    <button type="button" role="menuitem" disabled={props.disabled} onClick={() => props.run("hover")}><span>Hover information</span><kbd>Shift+K</kbd></button>
  </div></Portal>
}

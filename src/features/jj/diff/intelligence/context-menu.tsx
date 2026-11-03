import { onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { usePlugin } from "@opencode/plugin/gui"
import type { PeekKind } from "./rpc"

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
  onMount(() => {
    const bounds = menu.getBoundingClientRect()
    menu.style.left = `${Math.max(8, Math.min(props.x, window.innerWidth - bounds.width - 8))}px`
    menu.style.top = `${Math.max(8, Math.min(props.y, window.innerHeight - bounds.height - 8))}px`
    const first = menu.querySelector<HTMLButtonElement>("button:not(:disabled)")
    if (first) first.focus()
    else menu.focus()
    const outside = (event: Event) => { if (!event.composedPath().includes(menu)) props.close(false) }
    const close = () => props.close(false)
    document.addEventListener("pointerdown", outside, true)
    document.addEventListener("contextmenu", outside, true)
    document.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    window.addEventListener("blur", close)
    onCleanup(() => {
      document.removeEventListener("pointerdown", outside, true)
      document.removeEventListener("contextmenu", outside, true)
      document.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
      window.removeEventListener("blur", close)
    })
  })
  return <Portal><div ref={menu} class="jello-jj-symbol-menu" data-mode={ctx.appearance.mode()}
    role="menu" aria-label={`Symbol actions for ${props.symbol}`} tabIndex={-1}
    style={{ left: `${props.x}px`, top: `${props.y}px` }}
    onContextMenu={(event) => event.preventDefault()}
    onKeyDown={(event) => {
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault()
        event.stopPropagation()
        props.close(true)
      }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault()
        event.stopPropagation()
        const items = Array.from(menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
        const index = items.findIndex((item) => item === document.activeElement)
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
          : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length
        items[next]?.focus()
      }
      if (event.key === "F12" && !props.disabledReason) {
        event.preventDefault()
        event.stopPropagation()
        props.open(event.shiftKey ? "references" : "definition")
      }
    }}>
    <div class="jello-jj-symbol-menu-title">{props.symbol}</div>
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

import { onCleanup, onMount } from "solid-js"
import { Portal } from "solid-js/web"
import { usePlugin } from "@opencode/plugin/gui"

export function ChangeContextMenu(props: {
  x: number
  y: number
  disabled: boolean
  close(restoreFocus?: boolean): void
  abandon(): void
}) {
  const ctx = usePlugin()
  let menu!: HTMLDivElement
  let item!: HTMLButtonElement
  onMount(() => {
    const bounds = menu.getBoundingClientRect()
    menu.style.left = `${Math.max(8, Math.min(props.x, window.innerWidth - bounds.width - 8))}px`
    menu.style.top = `${Math.max(8, Math.min(props.y, window.innerHeight - bounds.height - 8))}px`
    if (props.disabled) menu.focus()
    else item.focus()
    const outside = (event: Event) => {
      if (event.target instanceof Node && !menu.contains(event.target)) props.close(false)
    }
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
  return <Portal>
    <div ref={menu} class="jello-jj-tree-context-menu" data-mode={ctx.appearance.mode()}
      role="menu" aria-label="Change actions" tabIndex={-1}
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
          if (!props.disabled) item.focus()
        }
      }}>
      <button ref={item} type="button" role="menuitem" disabled={props.disabled}
        title={props.disabled ? "Immutable changes cannot be abandoned" : "Run jj abandon on this change"}
        onClick={props.abandon}>Abandon</button>
    </div>
  </Portal>
}

import { onCleanup, onMount } from "solid-js"
import { Portal } from "solid-js/web"
import { usePlugin } from "@opencode/plugin/gui"

export function ChangeContextMenu(props: {
  x: number
  y: number
  disabled: boolean
  close(restoreFocus?: boolean): void
  abandon(): void
  describe(): void
}) {
  const ctx = usePlugin()
  const ui = ctx.ui
  let menu!: HTMLDivElement
  let item!: HTMLButtonElement
  let abandonItem!: HTMLButtonElement
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
          if (!props.disabled) {
            if (event.key === "Home") item.focus()
            else if (event.key === "End") abandonItem.focus()
            else (document.activeElement === item ? abandonItem : item).focus()
          }
        }
      }}>
      <button ref={item} type="button" role="menuitem" disabled={props.disabled}
        title={props.disabled ? "Immutable changes cannot be described" : "Edit the description of this change"}
        onClick={props.describe}><span aria-hidden="true"><ui.Icon name="edit" size="small" /></span><span class="jello-jj-tree-menu-label">Describe</span></button>
      <button ref={abandonItem} type="button" role="menuitem" disabled={props.disabled} class="is-danger"
        title={props.disabled ? "Immutable changes cannot be abandoned" : "Run jj abandon on this change"}
        onClick={props.abandon}><span aria-hidden="true"><ui.Icon name="circle-ban-sign" size="small" /></span><span class="jello-jj-tree-menu-label">Abandon</span></button>
    </div>
  </Portal>
}

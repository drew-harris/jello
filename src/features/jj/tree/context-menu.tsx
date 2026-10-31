import { onCleanup, onMount } from "solid-js"
import { Portal } from "solid-js/web"
import { usePlugin } from "@opencode/plugin/gui"

export function ChangeContextMenu(props: {
  x: number
  y: number
  disabled: boolean
  newDisabled: boolean
  newChange(): void
  close(restoreFocus?: boolean): void
  abandon(): void
  describe(): void
  edit(): void
  setBookmark(): void
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
          const items = Array.from(menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
          if (items.length) {
            const index = items.findIndex((item) => item === document.activeElement)
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
              : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length
            items[next].focus()
          }
        }
      }}>
      <button type="button" role="menuitem" disabled={props.newDisabled}
        title="Create a new change on top of this commit" onClick={props.newChange}>
        <span aria-hidden="true"><ui.Icon name="branch-out" size="small" /></span><span class="jello-jj-tree-menu-label">New change</span>
      </button>
      <button type="button" role="menuitem" disabled={props.disabled}
        title={props.disabled ? "Immutable changes cannot be edited" : "Switch the working copy to this change (jj edit)"}
        onClick={props.edit}><span aria-hidden="true"><ui.Icon name="enter" size="small" /></span><span class="jello-jj-tree-menu-label">Edit</span></button>
      <button type="button" role="menuitem" disabled={props.disabled}
        title={props.disabled ? "Immutable changes cannot be described" : "Edit the description of this change"}
        onClick={props.describe}><span aria-hidden="true"><ui.Icon name="edit" size="small" /></span><span class="jello-jj-tree-menu-label">Describe</span></button>
      <button type="button" role="menuitem" disabled={props.newDisabled} title="Move an existing bookmark here or create a new one"
        onClick={props.setBookmark}><span aria-hidden="true"><ui.Icon name="branch" size="small" /></span><span class="jello-jj-tree-menu-label">Set bookmark</span></button>
      <button type="button" role="menuitem" disabled={props.disabled} class="is-danger"
        title={props.disabled ? "Immutable changes cannot be abandoned" : "Run jj abandon on this change"}
        onClick={props.abandon}><span aria-hidden="true"><ui.Icon name="circle-ban-sign" size="small" /></span><span class="jello-jj-tree-menu-label">Abandon</span></button>
    </div>
  </Portal>
}

import { onCleanup, onMount } from "solid-js"

export function menuItemIndex(key: string, index: number, length: number) {
  if (!length) return undefined
  if (key === "Home") return 0
  if (key === "End") return length - 1
  if (key === "ArrowDown") return (index + 1 + length) % length
  if (key === "ArrowUp") return (index + length - 1) % length
}

// Content and styling stay with the feature; lifetime, placement, dismissal and
// accessible keyboard navigation are shared. composedPath supports code shadows.
export function createContextMenu(element: () => HTMLDivElement, props: { x: number; y: number; close(restoreFocus?: boolean): void }, environment = { window, document }) {
  const { window, document } = environment
  onMount(() => {
    const menu = element()
    const bounds = menu.getBoundingClientRect()
    menu.style.left = `${Math.max(8, Math.min(props.x, window.innerWidth - bounds.width - 8))}px`
    menu.style.top = `${Math.max(8, Math.min(props.y, window.innerHeight - bounds.height - 8))}px`
    const first = menu.querySelector<HTMLButtonElement>("button:not(:disabled)")
    ;(first ?? menu).focus()
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
  return (event: KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault()
      event.stopPropagation()
      props.close(true)
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const items = Array.from(element().querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
    const next = menuItemIndex(event.key, items.findIndex((item) => item === document.activeElement), items.length)
    if (next !== undefined) items[next]?.focus()
  }
}

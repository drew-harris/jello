export { codeScrollAmount as diffScrollAmount } from "../../../shared/gui/scroll-shortcuts"

export { codeHunkShortcut as diffHunkShortcut } from "../../../shared/gui/hunk-navigation"

export function diffToggleShortcut(event: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing: boolean
  repeat: boolean
}): "sidebar" | "layout" | "multiFile" | undefined {
  if (event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
  if (event.key === "f") return "sidebar"
  if (event.key === "t") return "layout"
  if (event.key === "c") return "multiFile"
}

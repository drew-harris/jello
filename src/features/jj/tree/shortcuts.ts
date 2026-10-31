export function treeShortcut(event: {
  key: string
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  isComposing: boolean
  repeat: boolean
}): "down" | "up" | "new" | "bookmark" | "expand" | "abandon" | "diff" | "describe" | "squash" | "edit" | undefined {
  if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
  if (event.shiftKey) return event.repeat ? undefined : event.key === "B" ? "bookmark" : event.key === "S" ? "squash" : undefined
  if (event.key === "j") return "down"
  if (event.key === "k") return "up"
  if (event.repeat) return
  if (event.key === "n") return "new"
  if (event.key === "l") return "expand"
  if (event.key === "a") return "abandon"
  if (event.key === "d") return "diff"
  if (event.key === "e") return "edit"
  if (event.key === "Enter") return "describe"
}

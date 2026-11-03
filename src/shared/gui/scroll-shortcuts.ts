export function codeScrollAmount(event: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing: boolean
}, height: number): number | undefined {
  if (event.isComposing || event.metaKey || event.altKey || event.shiftKey) return
  if (event.ctrlKey) {
    if (event.key === "d") return height / 2
    if (event.key === "u") return -height / 2
    return
  }
  if (event.key === "j") return 46
  if (event.key === "k") return -46
}

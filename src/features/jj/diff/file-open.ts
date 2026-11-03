import type { PeekLocation } from "../../intelligence/rpc"

// Share modifier handling across tree rows and both diff header renderers.
export function openFileClick(event: MouseEvent, path: string, open: (path: string) => void) {
  if (event.button !== 0 || !(event.metaKey || event.ctrlKey)) return false
  event.preventDefault()
  event.stopPropagation()
  open(path)
  return true
}

export function fileStart(directory: string, path: string): PeekLocation {
  return { path: `${directory.replace(/\/$/, "")}/${path}`, line: 0, character: 0, endLine: 0, endCharacter: 0 }
}

export type HunkNavigator = (direction: -1 | 1, smooth: boolean) => void
export type RegisterHunkNavigator = (navigate: HunkNavigator) => () => void

export function codeHunkShortcut(event: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing: boolean
  repeat: boolean
}): { direction: -1 | 1; smooth: boolean } | undefined {
  if (event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
  if (event.key === "[" || event.key === "{") return { direction: -1, smooth: event.shiftKey }
  if (event.key === "]" || event.key === "}") return { direction: 1, smooth: event.shiftKey }
}

// Tolerance avoids selecting the same hunk again due to pixel rounding.
export function adjacentHunk<T extends { top: number }>(targets: T[], top: number, direction: -1 | 1): T | undefined {
  return direction === 1 ? targets.find((target) => target.top > top + 2)
    : [...targets].reverse().find((target) => target.top < top - 2)
}

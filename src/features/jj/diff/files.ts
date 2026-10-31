import type { FileDiffMetadata } from "@pierre/diffs"

// Git object IDs describe both sides exactly. Reuse unchanged file models even
// when another file changes, avoiding unnecessary highlighting/DOM updates.
export function reuseDiffFiles(previous: readonly FileDiffMetadata[], next: FileDiffMetadata[]): FileDiffMetadata[] {
  const byName = new Map(previous.map((file) => [file.name, file]))
  return next.map((file) => {
    const old = byName.get(file.name)
    return old && file.newObjectId !== undefined && file.prevObjectId !== undefined
      && old.newObjectId === file.newObjectId && old.prevObjectId === file.prevObjectId
      && old.prevName === file.prevName && old.type === file.type && old.mode === file.mode && old.prevMode === file.prevMode
      ? old : file
  })
}

import type { FileDiffMetadata } from "@pierre/diffs"
import { unwrap } from "solid-js/store"

// createLatest exposes a deeply proxied, read-only Solid store. Pierre hydrates
// patch metadata in place, so it must receive the underlying mutable objects.
// Keep their identity (rather than cloning) for caches and working-copy polls.
export function rendererDiffFiles(files: FileDiffMetadata[]): FileDiffMetadata[] {
  return unwrap(files)
}

// Git object IDs describe both sides exactly. Reuse unchanged file models even
// when another file changes, avoiding unnecessary highlighting/DOM updates.
export function reuseDiffFiles(previous: readonly FileDiffMetadata[], next: FileDiffMetadata[]): FileDiffMetadata[] {
  const byName = new Map(unwrap(previous).map((file) => [file.name, file]))
  return next.map((file) => {
    const old = byName.get(file.name)
    return old && file.newObjectId !== undefined && file.prevObjectId !== undefined
      && old.newObjectId === file.newObjectId && old.prevObjectId === file.prevObjectId
      && old.prevName === file.prevName && old.type === file.type && old.mode === file.mode && old.prevMode === file.prevMode
      ? old : file
  })
}

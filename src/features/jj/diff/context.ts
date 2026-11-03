import { hydratePartialDiff, parsePatchFiles, type FileDiffContentsLoader, type FileDiffLoadedFiles, type FileDiffMetadata } from "@pierre/diffs"

// Share in-flight and completed loads across single/stacked views. Weak keys
// release contents when the revision's file model is no longer retained.
export function createDiffContextLoader(request: (file: FileDiffMetadata) => Promise<{ patch: string }>, onError?: (error: unknown) => void): FileDiffContentsLoader {
  const cache = new WeakMap<FileDiffMetadata, Promise<FileDiffLoadedFiles>>()
  return (file) => {
    const cached = cache.get(file)
    if (cached) return cached
    const pending = request(file).then(({ patch }): FileDiffLoadedFiles => {
      const full = parsePatchFiles(patch, undefined, true).flatMap((patch) => patch.files).find((candidate) => candidate.name === file.name)
      if (!full || !full.hunks.length) throw new Error(`No text context returned for ${file.name}`)
      const contents: FileDiffLoadedFiles = {
        oldFile: { name: file.prevName ?? file.name, contents: full.deletionLines.join("") },
        newFile: { name: file.name, contents: full.additionLines.join("") },
      }
      // Pierre catches hydration errors internally. Validate here as well so
      // failures reach the UI instead of looking like an ignored click.
      hydratePartialDiff("clone", file, contents)
      return contents
    }).catch((error) => {
      cache.delete(file)
      onError?.(error)
      throw error
    })
    cache.set(file, pending)
    return pending
  }
}

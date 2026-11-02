import type { CodeViewDiffItem, DiffLineAnnotation, FileDiffMetadata } from "@pierre/diffs"

export function createDiffStack<Metadata = undefined>() {
  const versions = new WeakMap<FileDiffMetadata, { version: number; annotations?: DiffLineAnnotation<Metadata>[] }>()
  let version = 0
  return (files: readonly FileDiffMetadata[], annotations?: (file: FileDiffMetadata) => DiffLineAnnotation<Metadata>[]): CodeViewDiffItem<Metadata>[] => files.map((fileDiff) => {
    const list = annotations?.(fileDiff)
    let saved = versions.get(fileDiff)
    if (!saved || saved.annotations !== list) {
      saved = { version: ++version, annotations: list }
      versions.set(fileDiff, saved)
    }
    return { id: fileDiff.name, type: "diff", fileDiff, version: saved.version, annotations: list }
  })
}

// CodeView exposes measured/estimated offsets without rendering every file.
export function stackFileIndex(length: number, top: (index: number) => number, scrollTop: number): number {
  let start = 0
  let end = length - 1
  let selected = -1
  while (start <= end) {
    const middle = Math.floor((start + end) / 2)
    if (top(middle) <= scrollTop + 1) { selected = middle; start = middle + 1 }
    else end = middle - 1
  }
  return length ? Math.max(0, selected) : -1
}

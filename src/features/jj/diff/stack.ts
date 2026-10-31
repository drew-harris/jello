import type { CodeViewDiffItem, FileDiffMetadata } from "@pierre/diffs"

export function createDiffStack() {
  const versions = new WeakMap<FileDiffMetadata, number>()
  let version = 0
  return (files: readonly FileDiffMetadata[]): CodeViewDiffItem[] => files.map((fileDiff) => {
    if (!versions.has(fileDiff)) versions.set(fileDiff, ++version)
    return { id: fileDiff.name, type: "diff", fileDiff, version: versions.get(fileDiff)! }
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

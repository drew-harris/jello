export interface DiffTarget {
  directory: string
  commitID: string
  file?: string
}

export interface DiffTabRevision {
  current: boolean
  changeID8: string
}

export function diffTabTitle(revision?: DiffTabRevision): string {
  return revision?.current ? "Working copy" : revision ? `JJ Diff · ${revision.changeID8}` : "JJ Diff"
}

const prefix = "jj-diff/"

export function diffTabID(target: DiffTarget): string {
  const base = `${prefix}${target.commitID}/${encodeURIComponent(target.directory)}`
  return target.file ? `${base}/file/${encodeURIComponent(target.file)}` : base
}

export function parseDiffTabID(id: string): DiffTarget | undefined {
  if (!id.startsWith(prefix)) return
  const [commitID, directory, kind, file, extra] = id.slice(prefix.length).split("/")
  if (!/^[a-f0-9]{40,64}$/.test(commitID ?? "") || !directory || extra !== undefined) return
  if (kind !== undefined && (kind !== "file" || !file)) return
  try {
    return { commitID, directory: decodeURIComponent(directory), ...(file ? { file: decodeURIComponent(file) } : {}) }
  } catch {
    return undefined
  }
}

export function diffFileIndex(files: readonly { name: string; prevName?: string }[], path?: string): number {
  if (path === undefined) return 0
  const index = files.findIndex((file) => file.name === path)
  return index >= 0 ? index : files.findIndex((file) => file.prevName === path)
}

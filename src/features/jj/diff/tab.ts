export interface DiffTarget {
  directory: string
  commitID?: string
  changeID?: string
  divergent?: boolean
  file?: string
}

export interface DiffTabRevision {
  current: boolean
  changeID8: string
  fullChangeID?: string
  commitID?: string
  divergent?: boolean
}

export function diffTabTitle(revision?: DiffTabRevision): string {
  return revision?.current ? "Working copy" : revision ? `JJ Diff · ${revision.changeID8}` : "JJ Diff"
}

const prefix = "jj-diff/"

export function diffTabID(target: DiffTarget): string {
  if (target.changeID && !target.divergent) {
    if (!/^(?:[k-z]{32}|[k-z]{64})$/.test(target.changeID)) throw new Error("Expected a full change ID")
    return `${prefix}change/${target.changeID}/${encodeURIComponent(target.directory)}`
  }
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(target.commitID ?? "")) throw new Error("Expected a full commit ID")
  return `${prefix}${target.commitID}/${encodeURIComponent(target.directory)}`
}

export function parseDiffTabID(id: string): DiffTarget | undefined {
  if (!id.startsWith(prefix)) return
  if (id.startsWith(`${prefix}change/`)) {
    const [changeID, directory, extra] = id.slice(`${prefix}change/`.length).split("/")
    if (!/^(?:[k-z]{32}|[k-z]{64})$/.test(changeID ?? "") || !directory || extra !== undefined) return
    try { return { changeID, directory: decodeURIComponent(directory) } }
    catch { return }
  }
  const [commitID, directory, kind, file, extra] = id.slice(prefix.length).split("/")
  if (!/^[a-f0-9]{40,64}$/.test(commitID ?? "") || !directory || extra !== undefined) return
  if (kind !== undefined && (kind !== "file" || !file)) return
  try {
    return { commitID, directory: decodeURIComponent(directory), ...(file ? { file: decodeURIComponent(file) } : {}) }
  } catch {
    return undefined
  }
}

export function reusableDiffTab(ids: readonly string[], target: DiffTarget, revisions: Readonly<Record<string, DiffTabRevision>>): string {
  const canonical = diffTabID(target)
  if (ids.includes(canonical)) return canonical
  return ids.find((id) => {
    const saved = parseDiffTabID(id)
    if (!saved || saved.directory !== target.directory) return false
    if (target.changeID && !target.divergent && !revisions[id]?.divergent
      && (saved.changeID === target.changeID || revisions[id]?.fullChangeID === target.changeID)) return true
    return !!target.commitID && saved.commitID === target.commitID
  }) ?? canonical
}

export function diffFileIndex(files: readonly { name: string; prevName?: string }[], path?: string): number {
  if (path === undefined) return 0
  const index = files.findIndex((file) => file.name === path)
  return index >= 0 ? index : files.findIndex((file) => file.prevName === path)
}

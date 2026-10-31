export interface DiffTarget {
  directory: string
  commitID: string
}

const prefix = "jj-diff/"

export function diffTabID(target: DiffTarget): string {
  return `${prefix}${target.commitID}/${encodeURIComponent(target.directory)}`
}

export function parseDiffTabID(id: string): DiffTarget | undefined {
  if (!id.startsWith(prefix)) return
  const [commitID, directory, extra] = id.slice(prefix.length).split("/")
  if (!/^[a-f0-9]{40,64}$/.test(commitID ?? "") || !directory || extra !== undefined) return
  try {
    return { commitID, directory: decodeURIComponent(directory) }
  } catch {
    return undefined
  }
}

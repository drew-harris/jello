import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execute = promisify(execFile)
const cache = new Map<string, { expires: number; promise: Promise<string[]> }>()

export function listBookmarks(directory: string, signal?: AbortSignal): Promise<string[]> {
  const cached = cache.get(directory)
  if (cached && cached.expires > Date.now()) return cached.promise
  const entry = { expires: Infinity, promise: Promise.resolve([] as string[]) }
  entry.promise = execute("jj", ["bookmark", "list", "--ignore-working-copy", "--color=never", "--no-pager", "-T", 'json(name) ++ "\\n"'], {
    cwd: directory, signal, timeout: 15_000, maxBuffer: 8 * 1024 * 1024,
  }).then(({ stdout }) => {
    const names = stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line) as string)
    entry.expires = Date.now() + 30_000
    return [...new Set(names)].sort((a, b) => a.localeCompare(b))
  }).catch((error) => {
    if (cache.get(directory) === entry) cache.delete(directory)
    const failure = error as Error & { stderr?: string }
    throw new Error(failure.stderr?.trim() || failure.message)
  })
  cache.set(directory, entry)
  if (cache.size > 64) cache.delete(cache.keys().next().value!)
  return entry.promise
}

export async function setBookmark(directory: string, commitID: string, name: string, signal?: AbortSignal): Promise<void> {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commitID)) throw new Error("Expected a full commit ID.")
  if (!name.trim() || /[\r\n\0]/.test(name)) throw new Error("Enter a bookmark name.")
  try {
    // `set` both creates missing names and moves existing ones. Explicitly
    // setting a bookmark on a selected commit may move it backwards/sideways.
    await execute("jj", ["bookmark", "set", "--revision", commitID, "--allow-backwards", "--color=never", "--no-pager", "--", name.trim()], {
      cwd: directory, signal, timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
    })
    cache.delete(directory)
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    throw new Error(failure.stderr?.trim() || failure.message)
  }
}

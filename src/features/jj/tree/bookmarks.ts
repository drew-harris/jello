import { runJJ, validateCommitID } from "../command.ts"
import { abortable, AsyncCache } from "../../../shared/server/async-cache.ts"

const cache = new AsyncCache<string[]>(30_000, 64)

export function listBookmarks(directory: string, signal?: AbortSignal): Promise<string[]> {
  if (signal?.aborted) return Promise.reject(signal.reason)
  return abortable(cache.get(directory, async () => {
    const { stdout } = await runJJ(["bookmark", "list", "--ignore-working-copy", "-T", 'json(name) ++ "\\n"'], {
      cwd: directory, timeout: 15_000, maxBuffer: 8 * 1024 * 1024,
    })
    const names = stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line) as string)
    return [...new Set(names)].sort((a, b) => a.localeCompare(b))
  }), signal)
}

export async function setBookmark(directory: string, commitID: string, name: string, signal?: AbortSignal): Promise<void> {
  validateCommitID(commitID)
  if (!name.trim() || /[\r\n\0]/.test(name)) throw new Error("Enter a bookmark name.")
  // `set` both creates missing names and moves existing ones. Explicitly
  // setting a bookmark on a selected commit may move it backwards/sideways.
  await runJJ(["bookmark", "set", "--revision", commitID, "--allow-backwards", "--", name.trim()], {
    cwd: directory, signal, timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  })
  cache.invalidate(directory)
}

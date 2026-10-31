import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execute = promisify(execFile)

export async function pushChange(directory: string, commitID: string, signal?: AbortSignal): Promise<void> {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commitID)) throw new Error("Expected a full commit ID.")
  if (/^0+$/.test(commitID)) throw new Error("Cannot push the root commit.")
  try {
    const { stdout } = await execute("jj", [
      "log", "--revision", commitID, "--no-graph", "--ignore-working-copy", "--color=never", "--no-pager",
      "--template", "json(local_bookmarks.map(|b| b.name()))",
    ], { cwd: directory, signal, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 })
    const names = JSON.parse(stdout) as string[]
    if (!names.length) throw new Error("Set a bookmark on this change before pushing.")
    // Explicit bookmarks are automatically tracked by JJ. Exact patterns avoid
    // accidentally pushing other bookmarks when a name contains glob syntax.
    await execute("jj", [
      "git", "push", ...names.flatMap((name) => ["--bookmark", `exact:${name}`]),
      "--ignore-working-copy", "--color=never", "--no-pager",
    ], { cwd: directory, signal, timeout: 300_000, maxBuffer: 8 * 1024 * 1024 })
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    throw new Error(failure.stderr?.trim() || failure.message)
  }
}

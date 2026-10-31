import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execute = promisify(execFile)

export async function abandon(directory: string, commitID: string, signal?: AbortSignal): Promise<void> {
  // Accept only exact commit IDs, never a revset or an option supplied by a client.
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commitID)) throw new Error("Expected a full commit ID.")
  try {
    await execute("jj", ["abandon", "-r", commitID, "--color=never", "--no-pager"], {
      cwd: directory,
      signal,
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, JJ_EDITOR: "false" },
    })
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    throw new Error(failure.stderr?.trim() || failure.message)
  }
}

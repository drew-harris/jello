import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execute = promisify(execFile)

export async function describe(directory: string, commitID: string, message: string, signal?: AbortSignal): Promise<void> {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commitID)) throw new Error("Expected a full commit ID.")
  if (/[\r\n]/.test(message)) throw new Error("Enter a single-line description.")
  try {
    await execute("jj", ["describe", "-r", commitID, "--message", message, "--color=never", "--no-pager"], {
      cwd: directory, signal, timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, JJ_EDITOR: "false" },
    })
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    throw new Error(failure.stderr?.trim() || failure.message)
  }
}

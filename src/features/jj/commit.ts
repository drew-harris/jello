import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execute = promisify(execFile)

export async function commit(directory: string, message: string, signal?: AbortSignal): Promise<void> {
  if (!message.trim()) throw new Error("Enter a commit message.")
  try {
    await execute("jj", ["commit", "--message", message.trim(), "--color=never", "--no-pager"], {
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

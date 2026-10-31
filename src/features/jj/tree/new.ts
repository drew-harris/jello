import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execute = promisify(execFile)

export async function newChange(directory: string, signal?: AbortSignal, commitID?: string): Promise<void> {
  if (commitID !== undefined && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commitID)) throw new Error("Expected a full commit ID.")
  try {
    await execute("jj", ["new", ...(commitID ? [commitID] : []), "--color=never", "--no-pager"], {
      cwd: directory, signal, timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, JJ_EDITOR: "false" },
    })
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    throw new Error(failure.stderr?.trim() || failure.message)
  }
}

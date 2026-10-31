import { execFile } from "node:child_process"
import { promisify } from "node:util"

export interface ChangedFile {
  path: string
  status: string
}

const execute = promisify(execFile)

export async function readChangedFiles(directory: string, signal?: AbortSignal, commitID?: string): Promise<ChangedFile[]> {
  if (commitID !== undefined && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commitID)) throw new Error("Expected a full commit ID.")
  try {
    // Snapshot the working copy so this includes edits made since the last status refresh.
    // JSON encoding keeps unusual filenames safe, including embedded newlines.
    const { stdout } = await execute("jj", ["diff", ...(commitID ? ["-r", commitID, "--ignore-working-copy"] : []), "--color=never", "--no-pager", "-T",
      "'{\"path\":' ++ json(path) ++ ',\"status\":' ++ json(status) ++ '}\n'",
    ], { cwd: directory, signal, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 })
    return stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line) as ChangedFile)
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    throw new Error(failure.stderr?.trim() || failure.message)
  }
}

import { runJJ, validateCommitID } from "./command.ts"

export interface ChangedFile {
  path: string
  status: string
}

export async function readChangedFiles(directory: string, signal?: AbortSignal, commitID?: string): Promise<ChangedFile[]> {
  if (commitID !== undefined) validateCommitID(commitID)
  // Snapshot the working copy so this includes edits made since the last status refresh.
  // JSON encoding keeps unusual filenames safe, including embedded newlines.
  const { stdout } = await runJJ(["diff", ...(commitID ? ["-r", commitID, "--ignore-working-copy"] : []), "-T",
    "'{\"path\":' ++ json(path) ++ ',\"status\":' ++ json(status) ++ '}\n'",
  ], { cwd: directory, signal, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 })
  return stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line) as ChangedFile)
}

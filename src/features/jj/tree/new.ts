import { runJJ, validateCommitID } from "../command.ts"

export async function newChange(directory: string, signal?: AbortSignal, commitID?: string): Promise<void> {
  if (commitID !== undefined) validateCommitID(commitID)
  await runJJ(["new", ...(commitID ? [commitID] : [])], {
    cwd: directory, signal, timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  })
}

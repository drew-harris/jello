import { runJJ, validateCommitID } from "../command.ts"

export async function editChange(directory: string, commitID: string, signal?: AbortSignal): Promise<void> {
  validateCommitID(commitID)
  await runJJ(["edit", commitID], {
    cwd: directory, signal, timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
  })
}

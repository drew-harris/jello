import { runJJ, validateCommitID } from "../command.ts"

export async function abandon(directory: string, commitID: string, signal?: AbortSignal): Promise<void> {
  // Accept only exact commit IDs, never a revset or an option supplied by a client.
  validateCommitID(commitID)
  await runJJ(["abandon", "-r", commitID], {
    cwd: directory, signal, timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  })
}

import { runJJ, validateCommitID } from "../command.ts"

export async function describe(directory: string, commitID: string, message: string, signal?: AbortSignal): Promise<void> {
  validateCommitID(commitID)
  if (/[\r\n]/.test(message)) throw new Error("Enter a single-line description.")
  await runJJ(["describe", "-r", commitID, "--message", message], {
    cwd: directory, signal, timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  })
}

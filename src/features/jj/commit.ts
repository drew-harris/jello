import { runJJ } from "./command.ts"

export async function commit(directory: string, message: string, signal?: AbortSignal): Promise<void> {
  if (!message.trim()) throw new Error("Enter a commit message.")
  await runJJ(["commit", "--message", message.trim()], {
    cwd: directory, signal, timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  })
}

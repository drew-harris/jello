import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { parseRevisions, revisionTemplate, type Overview } from "./overview.ts"

const execute = promisify(execFile)

export async function readOverview(directory: string, signal?: AbortSignal): Promise<Overview> {
  // Snapshot the working copy once, then read both revisions without another snapshot.
  const { text } = await readStatus(directory, signal)
  const { stdout } = await execute("jj", [
    "log", "--ignore-working-copy", "--no-graph", "--color=never", "--no-pager",
    "-r", "@ | parents(@)", "-T", revisionTemplate,
  ], { cwd: directory, signal, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 })
  return { text, revisions: parseRevisions(stdout) }
}

export async function readStatus(directory: string, signal?: AbortSignal): Promise<{ text: string }> {
  try {
    const { stdout, stderr } = await execute("jj", ["status", "--color=never", "--no-pager"], {
      cwd: directory,
      signal,
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
    })
    return { text: stdout + stderr }
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    throw new Error(failure.stderr?.trim() || failure.message)
  }
}

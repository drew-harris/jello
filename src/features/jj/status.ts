import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { parseRevisions, revisionTemplate, type Overview } from "./overview.ts"
import { countLineChanges } from "./line-changes.ts"

const execute = promisify(execFile)

export async function readOverview(directory: string, signal?: AbortSignal): Promise<Overview> {
  // Snapshot once, then read the current revision and two ancestor levels.
  const { text } = await readStatus(directory, signal)
  const { stdout } = await execute("jj", [
    "log", "--ignore-working-copy", "--no-graph", "--color=never", "--no-pager",
    "-r", "ancestors(@, 3)", "-T", revisionTemplate,
  ], { cwd: directory, signal, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 })
  const diff = await execute("jj", [
    "diff", "--git", "--context=3", "--ignore-working-copy", "--color=never", "--no-pager",
  ], { cwd: directory, signal, timeout: 15_000, maxBuffer: 32 * 1024 * 1024 })
  return { text, revisions: parseRevisions(stdout), lines: countLineChanges(diff.stdout) }
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

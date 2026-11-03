import { runJJ } from "./command.ts"
import { parseRevisions, revisionTemplate, type Overview } from "./overview.ts"
import { countLineChanges } from "./line-changes.ts"

export async function readOverview(directory: string, signal?: AbortSignal): Promise<Overview> {
  // Snapshot once, then read the current revision and two ancestor levels.
  const { text } = await readStatus(directory, signal)
  const { stdout } = await runJJ([
    "log", "--ignore-working-copy", "--no-graph",
    "-r", "ancestors(@, 3)", "-T", revisionTemplate,
  ], { cwd: directory, signal, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 })
  const diff = await runJJ([
    "diff", "--git", "--context=3", "--ignore-working-copy",
  ], { cwd: directory, signal, timeout: 15_000, maxBuffer: 32 * 1024 * 1024 })
  return { text, revisions: parseRevisions(stdout), lines: countLineChanges(diff.stdout) }
}

export async function readStatus(directory: string, signal?: AbortSignal): Promise<{ text: string }> {
  const { stdout, stderr } = await runJJ(["status"], {
    cwd: directory, signal, timeout: 15_000, maxBuffer: 4 * 1024 * 1024,
  })
  return { text: stdout + stderr }
}

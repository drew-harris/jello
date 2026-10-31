import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { parseRevisions, revisionTemplate, type Revision } from "../overview.ts"

const execute = promisify(execFile)

export interface RevisionDiff {
  patch: string
  revision: Revision
}

export async function readRevisionDiff(directory: string, commitID: string, signal?: AbortSignal): Promise<RevisionDiff> {
  // Only accept the immutable commit hash from the overview, never arbitrary revsets or options.
  if (!/^[a-f0-9]{40,64}$/.test(commitID)) throw new Error("Invalid commit ID")
  const options = { cwd: directory, signal, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 }
  try {
    const [metadata, diff] = await Promise.all([
      execute("jj", ["log", "--ignore-working-copy", "--no-graph", "--color=never", "--no-pager", "-r", commitID, "-T", revisionTemplate], options),
      execute("jj", ["diff", "--ignore-working-copy", "--git", "--context=6", "--color=never", "--no-pager", "-r", commitID], options),
    ])
    const revision = parseRevisions(metadata.stdout)[0]
    if (!revision) throw new Error("Revision not found")
    return { patch: diff.stdout, revision }
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    throw new Error(failure.stderr?.trim() || failure.message)
  }
}

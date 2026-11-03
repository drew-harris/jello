import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { parseRevisions, revisionTemplate, type Revision } from "../overview.ts"

const execute = promisify(execFile)

// Load only the requested file, pinned to the same immutable revision as the
// initial patch. A full-context diff also handles merged parents correctly.
export async function readDiffContext(directory: string, commitID: string, path: string, signal?: AbortSignal): Promise<{ patch: string }> {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commitID)) throw new Error("Invalid commit ID")
  if (!path || path.includes("\0") || path.startsWith("/") || path.split("/").some((part) => part === "..")) throw new Error("Invalid file path")
  try {
    const result = await execute("jj", ["diff", "--ignore-working-copy", "--git", "--context=2147483647", "--color=never", "--no-pager",
      "-r", commitID, "--", `file:${JSON.stringify(path)}`], { cwd: directory, signal, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 })
    return { patch: result.stdout }
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    throw new Error(failure.stderr?.trim() || failure.message)
  }
}

export interface RevisionDiff {
  patch: string
  revision: Revision
  unchanged?: boolean
}

const identityTemplate = [
  '"{"',
  "'\"commitID\":' ++ json(self.commit_id())",
  "',\"changeID\":' ++ json(self.change_id())",
  "',\"current\":' ++ json(current_working_copy)",
  "',\"divergent\":' ++ json(divergent)",
  '"}\\n"',
].join(" ++ ")

export async function readRevisionDiff(directory: string, commitID: string, signal?: AbortSignal, knownCommitID?: string): Promise<RevisionDiff> {
  // Normal tabs follow a full change ID; divergent tabs pin an exact commit.
  // Never accept arbitrary revsets, abbreviations, or options.
  const byChange = /^(?:[k-z]{32}|[k-z]{64})$/.test(commitID)
  if (!byChange && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commitID)) throw new Error("Invalid commit ID or change ID")
  if (knownCommitID !== undefined && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(knownCommitID)) throw new Error("Invalid known commit ID")
  const options = { cwd: directory, signal, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 }
  try {
    // A working-copy snapshot rewrites its commit hash. Compare full change IDs
    // so this tab follows that change only while it is still the working copy.
    const identities = await execute("jj", ["log", "--ignore-working-copy", "--no-graph", "--color=never", "--no-pager",
      "-r", `${commitID} | @`, "-T", identityTemplate], options)
    const commits = identities.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line) as {
      commitID: string; changeID: string; current: boolean; divergent: boolean
    })
    const matches = commits.filter((commit) => byChange ? commit.changeID === commitID : commit.commitID === commitID)
    if (matches.length !== 1) throw new Error("Change not found or divergent. Reopen a specific version from JJ Tree.")
    const original = matches[0]
    const current = commits.find((commit) => commit.current)
    const live = !!original && original.changeID === current?.changeID && !original.divergent && !current.divergent
    // Snapshot only a live working copy, then pin both metadata and patch to
    // the resulting exact commit. Historical tabs never snapshot the checkout.
    const metadata = await execute("jj", ["log", ...(!live ? ["--ignore-working-copy"] : []), "--no-graph", "--color=never", "--no-pager",
      "-r", live ? "@" : original.commitID, "-T", revisionTemplate], options)
    const revision = parseRevisions(metadata.stdout)[0]
    if (!revision) throw new Error("Revision not found")
    // The client already holds the patch for this immutable hash. Avoid the
    // expensive diff command and sending megabytes over the remote connection.
    if (revision.commitID === knownCommitID) return { revision, patch: "", unchanged: true }
    const diff = await execute("jj", ["diff", "--ignore-working-copy", "--git", "--context=6", "--color=never", "--no-pager", "-r", revision.commitID], options)
    return { patch: diff.stdout, revision }
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    throw new Error(failure.stderr?.trim() || failure.message)
  }
}

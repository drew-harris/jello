import { runJJ, validateCommitID } from "../command.ts"
import { parseRevisions, revisionTemplate, type Revision } from "../overview.ts"

// Load only the requested file, pinned to the same immutable revision as the
// initial patch. A full-context diff also handles merged parents correctly.
export async function readDiffContext(directory: string, commitID: string, path: string, signal?: AbortSignal): Promise<{ patch: string }> {
  validateCommitID(commitID, "Invalid commit ID")
  if (!path || path.includes("\0") || path.startsWith("/") || path.split("/").some((part) => part === "..")) throw new Error("Invalid file path")
  const result = await runJJ(["diff", "--ignore-working-copy", "--git", "--context=2147483647",
    "-r", commitID, "--", `file:${JSON.stringify(path)}`], { cwd: directory, signal, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 })
  return { patch: result.stdout }
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
  if (!byChange) validateCommitID(commitID, "Invalid commit ID or change ID")
  if (knownCommitID !== undefined) validateCommitID(knownCommitID, "Invalid known commit ID")
  const options = { cwd: directory, signal, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 }
  // A working-copy snapshot rewrites its commit hash. Compare full change IDs
  // so this tab follows that change only while it is still the working copy.
  const identities = await runJJ(["log", "--ignore-working-copy", "--no-graph",
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
  const metadata = await runJJ(["log", ...(!live ? ["--ignore-working-copy"] : []), "--no-graph",
    "-r", live ? "@" : original.commitID, "-T", revisionTemplate], options)
  const revision = parseRevisions(metadata.stdout)[0]
  if (!revision) throw new Error("Revision not found")
  // The client already holds the patch for this immutable hash. Avoid the
  // expensive diff command and sending megabytes over the remote connection.
  if (revision.commitID === knownCommitID) return { revision, patch: "", unchanged: true }
  const diff = await runJJ(["diff", "--ignore-working-copy", "--git", "--context=6", "-r", revision.commitID], options)
  return { patch: diff.stdout, revision }
}

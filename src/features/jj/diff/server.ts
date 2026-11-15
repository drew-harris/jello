import { runJJ, validateCommitID } from "../command.ts"
import { parseRevisions, revisionTemplate, type Revision } from "../overview.ts"
import { resolveDiffBase } from "./base.ts"

// Load only the requested file, pinned to the same immutable revision as the
// initial patch. A full-context diff also handles merged parents correctly.
export async function readDiffContext(directory: string, commitID: string, path: string, signal?: AbortSignal, baseCommitID?: string): Promise<{ patch: string }> {
  validateCommitID(commitID, "Invalid commit ID")
  if (baseCommitID !== undefined) validateCommitID(baseCommitID, "Invalid base commit ID")
  if (!path || path.includes("\0") || path.startsWith("/") || path.split("/").some((part) => part === "..")) throw new Error("Invalid file path")
  const result = await runJJ(["diff", "--ignore-working-copy", "--git", "--context=2147483647",
    ...(baseCommitID ? ["--from", baseCommitID, "--to", commitID] : ["-r", commitID]),
    "--", `file:${JSON.stringify(path)}`], { cwd: directory, signal, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 })
  return { patch: result.stdout }
}

export interface RevisionDiff {
  patch: string
  revision: Revision
  workingCopySource?: boolean
  baseCommitID?: string
  baseBranch?: string
  unchanged?: boolean
}

const identityTemplate = [
  '"{"',
  "'\"commitID\":' ++ json(self.commit_id())",
  "',\"changeID\":' ++ json(self.change_id())",
  "',\"current\":' ++ json(current_working_copy)",
  "',\"divergent\":' ++ json(divergent)",
  "',\"empty\":' ++ json(empty)",
  "',\"parents\":' ++ json(parents.map(|parent| parent.commit_id()))",
  '"}\\n"',
].join(" ++ ")

export async function readRevisionDiff(directory: string, commitID: string, signal?: AbortSignal, knownCommitID?: string,
  comparison?: { againstMain?: boolean; knownBaseCommitID?: string; diffBase?: string }): Promise<RevisionDiff> {
  // Normal tabs follow a full change ID; divergent tabs pin an exact commit.
  // Never accept arbitrary revsets, abbreviations, or options.
  const byChange = /^(?:[k-z]{32}|[k-z]{64})$/.test(commitID)
  if (!byChange) validateCommitID(commitID, "Invalid commit ID or change ID")
  if (knownCommitID !== undefined) validateCommitID(knownCommitID, "Invalid known commit ID")
  if (comparison?.knownBaseCommitID !== undefined) validateCommitID(comparison.knownBaseCommitID, "Invalid known base commit ID")
  const options = { cwd: directory, signal, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 }
  // A working-copy snapshot rewrites its commit hash. Compare full change IDs
  // so this tab follows that change only while it is still the working copy.
  const identities = await runJJ(["log", "--ignore-working-copy", "--no-graph",
    "-r", `${commitID} | @`, "-T", identityTemplate], options)
  const commits = identities.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line) as {
    commitID: string; changeID: string; current: boolean; divergent: boolean; empty: boolean; parents: string[]
  })
  const matches = commits.filter((commit) => byChange ? commit.changeID === commitID : commit.commitID === commitID)
  if (matches.length !== 1) throw new Error("Change not found or divergent. Reopen a specific version from JJ Tree.")
  const original = matches[0]
  const current = commits.find((commit) => commit.current)
  const live = !!original && original.changeID === current?.changeID && !original.divergent && !current.divergent
  const emptyParent = current?.empty && current.parents.length === 1 && current.parents[0] === original.commitID
  // Only snapshot historical tabs when they may be the source of an empty @.
  // Check again after snapshotting: unrecorded edits can make @ non-empty.
  let workingCopySource = live
  if (!live && emptyParent) {
    const snapshot = await runJJ(["log", "--no-graph", "-r", "@", "-T", identityTemplate], options)
    const checkout = JSON.parse(snapshot.stdout.trim()) as typeof original
    workingCopySource = checkout.empty && checkout.parents.length === 1 && checkout.parents[0] === original.commitID
  }
  // Pin both metadata and patch to an exact commit. Only live tabs follow @;
  // the empty-parent check above never changes a historical tab's revision.
  const metadata = await runJJ(["log", ...(!live ? ["--ignore-working-copy"] : []), "--no-graph",
    "-r", live ? "@" : original.commitID, "-T", revisionTemplate], options)
  const revision = parseRevisions(metadata.stdout)[0]
  if (!revision) throw new Error("Revision not found")
  let baseCommitID: string | undefined
  let baseBranch: string | undefined
  if (comparison?.againstMain) {
    const branch = await resolveDiffBase(options, comparison.diffBase)
    baseBranch = branch.label
    // Three-dot/PR semantics: default-branch-only changes must not appear as reversals.
    // Pin the base too, so context expansion never resolves a moved bookmark.
    const bases = await runJJ(["log", "--ignore-working-copy", "--no-graph",
      "-r", `heads(::${branch.commitID} & ::${revision.commitID})`, "-T", 'commit_id ++ "\\n"'], options)
    const ids = bases.stdout.trim().split("\n").filter(Boolean)
    if (ids.length !== 1) throw new Error(`PR diff requires a single common ancestor with ${baseBranch}.`)
    baseCommitID = ids[0]
  }
  // The client already holds the patch for this immutable hash. Avoid the
  // expensive diff command and sending megabytes over the remote connection.
  if (revision.commitID === knownCommitID && baseCommitID === comparison?.knownBaseCommitID)
    return { revision, workingCopySource, baseCommitID, baseBranch, patch: "", unchanged: true }
  const diff = await runJJ(["diff", "--ignore-working-copy", "--git", "--context=6",
    ...(baseCommitID ? ["--from", baseCommitID, "--to", revision.commitID] : ["-r", revision.commitID])], options)
  return { patch: diff.stdout, revision, workingCopySource, baseCommitID, baseBranch }
}

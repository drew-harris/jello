import { createHash } from "node:crypto"
import { realpath } from "node:fs/promises"
import { isAbsolute, relative } from "node:path"
import { runJJ, validateCommitID } from "./command.ts"
import { AsyncCache, abortable } from "../../shared/server/async-cache.ts"

const snapshots = new AsyncCache<{ root: string; commit: string; base?: string }>(2000, 16)
const patches = new AsyncCache<{ current: string; branch: string; hash: string }>(60_000, 64)

export async function readFileChanges(directory: string, path: string, signal?: AbortSignal) {
  signal?.throwIfAborted()
  if (!isAbsolute(path) || path.includes("\0")) throw new Error("Expected an absolute file path")
  const options = { cwd: directory, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }
  const snapshot = await abortable(snapshots.get(directory, async () => {
    const root = (await runJJ(["root", "--ignore-working-copy"], options)).stdout.trim()
    // Snapshot once, then pin every subsequent read to this immutable commit.
    const commit = (await runJJ(["log", "--no-graph", "-r", "@", "-T", "commit_id"], options)).stdout.trim()
    validateCommitID(commit)
    const baseline = 'coalesce(remote_bookmarks(exact:"main"), remote_bookmarks(exact:"master"), bookmarks(exact:"main"), bookmarks(exact:"master"))'
    const heads = (await runJJ(["log", "--ignore-working-copy", "--no-graph", "-r", baseline, "-T", 'commit_id ++ "\\n"'], options)).stdout.trim().split("\n").filter(Boolean)
    const bases = heads.length === 1 ? (await runJJ(["log", "--ignore-working-copy", "--no-graph", "-r", `fork_point(${commit} | ${heads[0]})`, "-T", 'commit_id ++ "\\n"'], options)).stdout.trim().split("\n").filter(Boolean) : []
    return { root, commit, base: bases.length === 1 ? bases[0] : undefined }
  }), signal)
  const file = relative(snapshot.root, await realpath(path))
  if (!file || file === ".." || file.startsWith("../") || isAbsolute(file)) return { current: "", branch: "", hash: "", note: "Outside the JJ repository" }
  const data = await abortable(patches.get(JSON.stringify([snapshot.root, snapshot.commit, snapshot.base, file]), async () => {
    const spec = `file:${JSON.stringify(file)}`
    const pinned = { ...options, cwd: snapshot.root }
    const [content, current, branch] = await Promise.all([
      runJJ(["file", "show", "--ignore-working-copy", "-r", snapshot.commit, "--", spec], pinned),
      runJJ(["diff", "--ignore-working-copy", "--git", "--context=0", "-r", snapshot.commit, "--", spec], pinned),
      snapshot.base ? runJJ(["diff", "--ignore-working-copy", "--git", "--context=0", "--from", snapshot.base, "--to", snapshot.commit, "--", spec], pinned) : Promise.resolve({ stdout: "" }),
    ])
    return { current: current.stdout, branch: branch.stdout, hash: createHash("sha256").update(content.stdout).digest("hex") }
  }), signal)
  return { ...data, note: snapshot.base ? "" : "No unique main/master fork found; showing current change only" }
}

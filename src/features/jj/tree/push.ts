import { runJJ, validateCommitID } from "../command.ts"

export async function pushChange(directory: string, commitID: string, signal?: AbortSignal): Promise<void> {
  validateCommitID(commitID)
  if (/^0+$/.test(commitID)) throw new Error("Cannot push the root commit.")
  const { stdout } = await runJJ([
    "log", "--revision", commitID, "--no-graph", "--ignore-working-copy",
    "--template", "json(local_bookmarks.map(|b| b.name()))",
  ], { cwd: directory, signal, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 })
  const names = JSON.parse(stdout) as string[]
  if (!names.length) throw new Error("Set a bookmark on this change before pushing.")
  // Explicit bookmarks are automatically tracked by JJ. Exact patterns avoid
  // accidentally pushing other bookmarks when a name contains glob syntax.
  await runJJ([
    "git", "push", ...names.flatMap((name) => ["--bookmark", `exact:${name}`]), "--ignore-working-copy",
  ], { cwd: directory, signal, timeout: 300_000, maxBuffer: 8 * 1024 * 1024 })
}

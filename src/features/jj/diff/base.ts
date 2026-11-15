import { runJJ } from "../command.ts"
import { parseRevisions, revisionTemplate } from "../overview.ts"
import type { CommandOptions } from "../../../shared/server/command.ts"

export function diffBaseOption(value: unknown): string | undefined {
  if (value === undefined) return
  if (typeof value !== "string" || !value.trim() || /[\0\r\n]/.test(value))
    throw new Error("Jello jjDiffBase must be a bookmark name, optionally followed by @remote.")
  return value.trim()
}

export async function resolveDiffBase(options: CommandOptions, override?: string) {
  const name = diffBaseOption(override)
  const at = name?.lastIndexOf("@") ?? -1
  if (at === 0 || (name && at === name.length - 1)) throw new Error("Invalid jjDiffBase bookmark or remote.")
  const revset = name
    ? at < 0 ? `bookmarks(exact:${JSON.stringify(name)})`
      : `remote_bookmarks(exact:${JSON.stringify(name.slice(0, at))}, exact:${JSON.stringify(name.slice(at + 1))})`
    : 'coalesce(trunk() ~ root(), bookmarks(exact:"main"), bookmarks(exact:"master"))'
  const result = await runJJ(["log", "--ignore-working-copy", "--no-graph", "-r", revset, "-T", revisionTemplate], options)
  const revisions = parseRevisions(result.stdout)
  if (revisions.length !== 1)
    throw new Error(`Could not resolve a unique ${name ? `diff base "${name}"` : "default branch"}. Set Jello's jjDiffBase option to a bookmark name (for example master or main@origin).`)
  const revision = revisions[0]!
  const label = name ?? revision.bookmarks.find((bookmark) => ["main", "master", "trunk"].includes(bookmark))
    ?? revision.bookmarks[0] ?? "trunk()"
  return { commitID: revision.commitID, label }
}

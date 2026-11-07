export interface JJWorktreeOptions {
  command: string
  colocate: boolean
  sparsePatterns: "copy" | "full" | "empty"
  start: "current" | "parents"
  readTimeoutMs: number
  writeTimeoutMs: number
  maxOutputBytes: number
}

// Kept separate from OpenCode's worktree.directory: the host owns destination
// policy, while JJ owns checkout semantics and command budgets.
export function worktreeOptions(value: unknown): JJWorktreeOptions | undefined {
  if (value === false) return
  if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value))) {
    throw new Error("Jello jjWorktrees must be an options object or false.")
  }
  const input = (value ?? {}) as Record<string, unknown>
  const defaults: JJWorktreeOptions = {
    command: "jj", colocate: true, sparsePatterns: "copy", start: "current",
    readTimeoutMs: 30_000, writeTimeoutMs: 600_000, maxOutputBytes: 8 * 1024 * 1024,
  }
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(defaults, key)) throw new Error(`Unknown Jello jjWorktrees option: ${key}`)
  }
  const result = { ...defaults, ...input } as JJWorktreeOptions
  if (typeof result.command !== "string" || !result.command.trim() || /[\0\r\n]/.test(result.command)) {
    throw new Error("jjWorktrees.command must be an executable name or path, not a shell command.")
  }
  if (typeof result.colocate !== "boolean") throw new Error("jjWorktrees.colocate must be a boolean.")
  if (!["copy", "full", "empty"].includes(result.sparsePatterns)) throw new Error("Invalid jjWorktrees.sparsePatterns.")
  if (!["current", "parents"].includes(result.start)) throw new Error("Invalid jjWorktrees.start.")
  for (const key of ["readTimeoutMs", "writeTimeoutMs", "maxOutputBytes"] as const) {
    if (!Number.isSafeInteger(result[key]) || result[key] <= 0 || result[key] > 2_147_483_647) {
      throw new Error(`jjWorktrees.${key} must be a positive integer no larger than 2147483647.`)
    }
  }
  return result
}

import { runCommand, type CommandOptions } from "../../shared/server/command.ts"

export function validateCommitID(id: string, message = "Expected a full commit ID.") {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(id)) throw new Error(message)
}

// Snapshot policy stays explicit at the call site: never silently snapshot a
// historical read. Put global flags before `--` so filenames stay literal.
export function runJJ(args: string[], options: CommandOptions, command = "jj") {
  return runCommand(command, ["--color=never", "--no-pager", ...args], {
    ...options, env: { ...process.env, JJ_EDITOR: "false", ...options.env },
  })
}

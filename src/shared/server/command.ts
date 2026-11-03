import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execute = promisify(execFile)

export interface CommandOptions {
  cwd: string
  signal?: AbortSignal
  timeout: number
  maxBuffer: number
  env?: NodeJS.ProcessEnv
}

export class CommandError extends Error {
  constructor(readonly command: string, readonly args: readonly string[], readonly duration: number, cause: unknown) {
    const failure = cause as Error & { stderr?: string }
    super(failure.stderr?.trim() || failure.message, { cause })
    this.name = "CommandError"
  }
}

// No shell interpolation; callers own argument validation and output budgets.
export async function runCommand(command: string, args: string[], options: CommandOptions) {
  const started = Date.now()
  try {
    const result = await execute(command, args, { ...options, encoding: "utf8" })
    return { stdout: result.stdout, stderr: result.stderr, duration: Date.now() - started }
  } catch (error) {
    throw new CommandError(command, args, Date.now() - started, error)
  }
}

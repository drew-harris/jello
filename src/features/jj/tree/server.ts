import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { parseHistory, treeTemplate, type TreeHistory } from "./model.ts"

const execute = promisify(execFile)

export async function readTree(directory: string, limit: number, signal?: AbortSignal): Promise<TreeHistory> {
  try {
    const { stdout } = await execute("jj", [
      "log", "--no-graph", "--color=never", "--no-pager",
      "--limit", String(limit + 1), "--template", treeTemplate,
    ], { cwd: directory, signal, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 })
    return parseHistory(stdout, limit)
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    throw new Error(failure.stderr?.trim() || failure.message)
  }
}

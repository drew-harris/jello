import { runJJ } from "../command.ts"
import { parseHistory, treeTemplate, type TreeHistory } from "./model.ts"

export async function readTree(directory: string, limit: number, signal?: AbortSignal): Promise<TreeHistory> {
  const { stdout } = await runJJ([
    "log", "--no-graph", "--limit", String(limit + 1), "--template", treeTemplate,
  ], { cwd: directory, signal, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 })
  return parseHistory(stdout, limit)
}

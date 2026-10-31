import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { parseHistory, treeTemplate } from "./model"
import { squashDescription, type SquashDetails } from "./squash-model"

const execute = promisify(execFile)
const validate = (id: string) => {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(id)) throw new Error("Expected a full commit ID.")
}

export async function readSquashDetails(directory: string, commitID: string, signal?: AbortSignal): Promise<SquashDetails> {
  validate(commitID)
  try {
    const { stdout } = await execute("jj", ["log", "--no-graph", "-r", `${commitID} | parents(${commitID})`, "-T", treeTemplate,
      "--ignore-working-copy", "--color=never", "--no-pager"], { cwd: directory, signal, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 })
    const commits = parseHistory(stdout, Infinity).commits
    const source = commits.find((commit) => commit.commitID === commitID)
    if (!source || source.immutable || !source.parents.length) throw new Error("This change cannot be squashed: it is immutable or has no parent.")
    return {
      sourceDescription: source.description,
      parents: source.parents.map((id) => {
        const parent = commits.find((commit) => commit.commitID === id)
        if (!parent) throw new Error("Could not load the parent change.")
        return { commitID: parent.commitID, changeID: parent.changeID, description: parent.description, immutable: parent.immutable }
      }),
    }
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    throw new Error(failure.stderr?.trim() || failure.message)
  }
}

export async function squashBelow(directory: string, commitID: string, parentID: string, message?: string, signal?: AbortSignal): Promise<void> {
  validate(commitID)
  validate(parentID)
  const details = await readSquashDetails(directory, commitID, signal)
  const parent = details.parents.find((parent) => parent.commitID === parentID)
  if (!parent) throw new Error("Squash below must target a direct parent of this change.")
  if (parent.immutable) throw new Error("Cannot squash into an immutable parent.")
  if (message === undefined && parent.description.trim() && details.sourceDescription.trim()) {
    throw new Error("Review the combined description before squashing.")
  }
  try {
    await execute("jj", ["squash", "--from", commitID, "--into", parentID, "--message",
      message ?? squashDescription(parent.description, details.sourceDescription), "--color=never", "--no-pager"], {
      cwd: directory, signal, timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, JJ_EDITOR: "false" },
    })
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    throw new Error(failure.stderr?.trim() || failure.message)
  }
}

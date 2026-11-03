import { runJJ, validateCommitID } from "../command.ts"
import { parseHistory, treeTemplate } from "./model"
import { squashDescription, type SquashDetails } from "./squash-model"

export async function readSquashDetails(directory: string, commitID: string, signal?: AbortSignal): Promise<SquashDetails> {
  validateCommitID(commitID)
  const { stdout } = await runJJ(["log", "--no-graph", "-r", `${commitID} | parents(${commitID})`, "-T", treeTemplate,
    "--ignore-working-copy"], { cwd: directory, signal, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 })
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
}

export async function squashBelow(directory: string, commitID: string, parentID: string, message?: string, signal?: AbortSignal): Promise<void> {
  validateCommitID(commitID)
  validateCommitID(parentID)
  const details = await readSquashDetails(directory, commitID, signal)
  const parent = details.parents.find((parent) => parent.commitID === parentID)
  if (!parent) throw new Error("Squash below must target a direct parent of this change.")
  if (parent.immutable) throw new Error("Cannot squash into an immutable parent.")
  if (message === undefined && parent.description.trim() && details.sourceDescription.trim()) {
    throw new Error("Review the combined description before squashing.")
  }
  await runJJ(["squash", "--from", commitID, "--into", parentID, "--message",
    message ?? squashDescription(parent.description, details.sourceDescription)], {
    cwd: directory, signal, timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
  })
}

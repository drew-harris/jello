import { guardedAction, type Action } from "../../../shared/gui/action"
import type { TreeCommit } from "./model"

export type ChangeActionID = "new" | "edit" | "describe" | "bookmark" | "squash" | "push" | "abandon"

export function createChangeActions(input: {
  busy(): boolean
  commits(): TreeCommit[]
  run(id: ChangeActionID, target: TreeCommit, source?: "keyboard" | "menu"): void | Promise<void>
}) {
  const root = (id: string) => /^0+$/.test(id)
  const busy = () => input.busy() ? "Another change operation is still running." : undefined
  const mutable = (target: TreeCommit) => busy() ?? (target.immutable || root(target.commitID) ? "Immutable changes cannot be modified" : undefined)
  const definitions: Array<Omit<Action<TreeCommit>, "run"> & { id: ChangeActionID }> = [
    { id: "new", label: "New change", icon: "branch-out", description: "Create a new change on top of this commit", disabledReason: busy },
    { id: "edit", label: "Edit", icon: "enter", description: "Switch the working copy to this change (jj edit)", disabledReason: mutable },
    { id: "describe", label: "Describe", icon: "edit", description: "Edit the description of this change", disabledReason: mutable },
    { id: "bookmark", label: "Set bookmark", icon: "branch", description: "Move an existing bookmark here or create a new one", disabledReason: busy },
    { id: "squash", label: "Squash below", icon: "arrow-down-to-line", description: "Squash this change into a parent (Shift+S)",
      disabledReason: (target) => mutable(target) ?? (!target.parents.length || target.parents.every((id) => root(id) || input.commits().find((commit) => commit.commitID === id)?.immutable === true)
        ? "No mutable direct parent to squash into" : undefined) },
    { id: "push", label: "Git push", icon: "cloud-upload", description: "Push this change's bookmarks to Git, tracking them if needed (set a bookmark first)",
      disabledReason: (target) => busy() ?? (root(target.commitID) ? "Cannot push the root commit" : !target.bookmarks.length ? "Set a bookmark on this change before pushing" : undefined) },
    { id: "abandon", label: "Abandon", icon: "circle-ban-sign", description: "Run jj abandon on this change", danger: true, disabledReason: mutable },
  ]
  return definitions.map((definition) => guardedAction<TreeCommit>({ ...definition, run: (target, source) => input.run(definition.id, target, source) }))
}

import { createSignal } from "solid-js"
import { parseDiffTabID } from "./tab"

// Only user intent lives in a cached view model. Remote data belongs to Query.
export function createDiffModel(id: string) {
  const target = parseDiffTabID(id)
  if (!target) throw new Error("Invalid diff tab")
  const [path, selectPath] = createSignal<string | undefined>(target.file)
  const [query, setQuery] = createSignal("")
  const [sidebarWidth, setSidebarWidth] = createSignal(240)
  return { path, selectPath, query, setQuery, sidebarWidth, setSidebarWidth }
}

export type DiffModel = ReturnType<typeof createDiffModel>

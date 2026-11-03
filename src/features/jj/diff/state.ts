import { parsePatchFiles } from "@pierre/diffs"
import type { MountedSession } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, on } from "solid-js"
import { Status } from "../rpc"
import type { RevisionDiff } from "./server"
import { diffFileIndex, parseDiffTabID } from "./tab"
import { reuseDiffFiles } from "./files"
import { DIFF_POLL_INTERVAL } from "./poll"
import { createResourceModel } from "../../../shared/gui/resource"

export function createDiffModel(id: string) {
  const target = parseDiffTabID(id)
  if (!target) throw new Error("Invalid diff tab")
  const [path, setPath] = createSignal<string | undefined>(target.file)
  const [query, setQuery] = createSignal("")
  const [sidebarWidth, setSidebarWidth] = createSignal(240)
  const resource = createResourceModel<MountedSession["server"]["client"], { data: RevisionDiff; files: ReturnType<typeof reuseDiffFiles> }>(async (client, signal, previous) => {
    const knownCommitID = previous?.data.revision.commitID
    const changeID = target.changeID ?? (!previous?.data.revision.divergent ? previous?.data.revision.fullChangeID : undefined)
    const update = await client.rpc(Status).diff({ directory: target.directory,
      ...(changeID ? { changeID } : { commitID: knownCommitID ?? target.commitID }),
      ...(knownCommitID ? { knownCommitID } : {}) }, { signal }) as RevisionDiff
    signal.throwIfAborted()
    if (update.unchanged && !previous) throw new Error("Missing cached diff. Refresh to load it again.")
    const data = update.unchanged ? { ...update, patch: previous!.data.patch } : update
    const files = previous?.data.patch === data.patch ? previous.files
      : reuseDiffFiles(previous?.files ?? [], parsePatchFiles(data.patch, `${target.directory}:${data.revision.commitID}`, true).flatMap((patch) => patch.files))
    return { data, files }
  }, { interval: DIFF_POLL_INTERVAL })
  const { result } = resource
  // Track selection by path, so inserting/reordering files cannot show the wrong
  // file for a frame while an effect repairs a numeric index.
  const selected = createMemo(() => diffFileIndex(result.latest?.files ?? [], path()))
  createEffect(on(() => result.latest, (latest) => {
    if (path() === undefined && latest?.files.length) setPath(latest.files[0]!.name)
  }))
  return {
    ...resource, selected, query, setQuery, sidebarWidth, setSidebarWidth,
    setSelected(index: number) { setPath(result.latest?.files[index]?.name) },
    selectPath: setPath,
    configure(client: MountedSession["server"]["client"]) {
      resource.configure(client)
    },
  }
}

export type DiffModel = ReturnType<typeof createDiffModel>

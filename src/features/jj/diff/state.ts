import { parsePatchFiles } from "@pierre/diffs"
import { createLatest, type MountedSession } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, on, untrack } from "solid-js"
import { Status } from "../rpc"
import type { RevisionDiff } from "./server"
import { diffFileIndex, parseDiffTabID } from "./tab"
import { reuseDiffFiles } from "./files"
import { DIFF_POLL_INTERVAL, diffPollDelay } from "./poll"

export function createDiffModel(id: string) {
  const target = parseDiffTabID(id)
  if (!target) throw new Error("Invalid diff tab")
  const [request, setRequest] = createSignal<{ client: MountedSession["server"]["client"] }>()
  const [path, setPath] = createSignal<string | undefined>(target.file)
  const [query, setQuery] = createSignal("")
  const [sidebarWidth, setSidebarWidth] = createSignal(240)
  const [lastFinished, setLastFinished] = createSignal(0)
  const [nextDelay, setNextDelay] = createSignal(DIFF_POLL_INTERVAL)
  let failures = 0
  const result = createLatest(request, async ({ client }, signal): Promise<{ data: RevisionDiff; files: ReturnType<typeof reuseDiffFiles> }> => {
    const previous = untrack(() => result.latest)
    const started = Date.now()
    try {
      const knownCommitID = previous?.data.revision.commitID
      const changeID = target.changeID ?? (!previous?.data.revision.divergent ? previous?.data.revision.fullChangeID : undefined)
      const update = await client.rpc(Status).diff({ directory: target.directory,
        ...(changeID ? { changeID } : { commitID: knownCommitID ?? target.commitID }),
        ...(knownCommitID ? { knownCommitID } : {}) }) as RevisionDiff
      if (signal.aborted) throw new Error("Diff request superseded")
      if (update.unchanged && !previous) throw new Error("Missing cached diff. Refresh to load it again.")
      const data = update.unchanged ? { ...update, patch: previous!.data.patch } : update
      const files = previous?.data.patch === data.patch ? previous.files
        : reuseDiffFiles(previous?.files ?? [], parsePatchFiles(data.patch, `${target.directory}:${data.revision.commitID}`, true).flatMap((patch) => patch.files))
      failures = 0
      return { data, files }
    } catch (error) {
      if (!signal.aborted) failures++
      throw error
    } finally {
      if (!signal.aborted) {
        const finished = Date.now()
        setLastFinished(finished)
        setNextDelay(diffPollDelay(finished - started, failures))
      }
    }
  })
  // Track selection by path, so inserting/reordering files cannot show the wrong
  // file for a frame while an effect repairs a numeric index.
  const selected = createMemo(() => diffFileIndex(result.latest?.files ?? [], path()))
  createEffect(on(() => result.latest, (latest) => {
    if (path() === undefined && latest?.files.length) setPath(latest.files[0]!.name)
  }))
  return {
    result, selected, query, setQuery, sidebarWidth, setSidebarWidth, lastFinished, nextDelay,
    setSelected(index: number) { setPath(result.latest?.files[index]?.name) },
    selectPath: setPath,
    configure(client: MountedSession["server"]["client"]) {
      if (untrack(request)?.client !== client) setRequest({ client })
    },
    refresh() {
      if (!result.loading) setRequest((previous) => previous && { ...previous })
    },
  }
}

export type DiffModel = ReturnType<typeof createDiffModel>

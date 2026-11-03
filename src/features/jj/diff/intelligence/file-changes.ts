import type { Accessor } from "solid-js"
import type { MountedSession } from "@opencode/plugin/gui"
import { Status } from "../../rpc"
import { mergeMarkers, patchMarkers, type FileChangeProvider } from "../../../intelligence/file-changes"
import type { SourceDocument } from "../../../intelligence/rpc"

interface ChangePatches { current: string; branch: string; hash: string; note: string }

export async function verifiedFileChanges(document: SourceDocument, data: ChangePatches) {
  if (!data.hash) return { markers: [], note: data.note }
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(document.text))
  const hash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")
  if (hash !== data.hash) return { markers: [], note: "Source differs from the JJ snapshot; refresh source to load gutter signs" }
  const count = document.text.split("\n").length
  return { markers: mergeMarkers(patchMarkers(data.branch, "branch", count), patchMarkers(data.current, "current", count)), note: data.note }
}

export function createFileChangeProvider(session: Accessor<MountedSession>): FileChangeProvider {
  return async (document, signal) => {
    const current = session()
    const data = await current.server.client.rpc(Status).fileChanges({ directory: current.directory, path: document.path }, { signal }) as ChangePatches
    signal.throwIfAborted()
    return verifiedFileChanges(document, data)
  }
}

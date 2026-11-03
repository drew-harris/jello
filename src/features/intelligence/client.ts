import type { MountedSession } from "@opencode/plugin/gui"
import type { Accessor } from "solid-js"
import { Intelligence, type HoverResult, type LookupKind, type PeekResult, type SourceDocument, type SymbolPosition } from "./rpc"

export interface LanguageClient {
  document(path: string, signal: AbortSignal): Promise<SourceDocument>
  lookup(position: SymbolPosition, kind: LookupKind, signal: AbortSignal): Promise<PeekResult>
  hover(position: SymbolPosition, signal: AbortSignal): Promise<HoverResult>
}

export function createLanguageClient(session: Accessor<MountedSession>): LanguageClient {
  const connection = () => {
    const current = session()
    return { directory: current.directory, rpc: current.server.client.rpc(Intelligence) }
  }
  const positionInput = ({ path, line, character, expectedLine }: SymbolPosition) => ({ path, line, character, expectedLine })
  return {
    async document(path, signal) {
      const { directory, rpc } = connection()
      return await rpc.document({ directory, path }, { signal }) as SourceDocument
    },
    async lookup(position, kind, signal) {
      const { directory, rpc } = connection()
      return await rpc.lookup({ directory, ...positionInput(position), kind }, { signal }) as PeekResult
    },
    async hover(position, signal) {
      const { directory, rpc } = connection()
      return await rpc.hover({ directory, ...positionInput(position) }, { signal }) as HoverResult
    },
  }
}

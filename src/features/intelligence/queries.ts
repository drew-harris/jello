import { navigationKinds, type NavigationKind } from "./rpc"

// One catalog drives the file toolbar and context menu. New location queries
// share the same result list, document loader, cancellation and navigation.
const metadata: Record<NavigationKind, { label: string; shortcut?: string }> = {
  definition: { label: "Definition", shortcut: "F12" },
  references: { label: "References", shortcut: "Shift+F12" },
  typeDefinition: { label: "Type definition" },
  implementation: { label: "Implementations" },
}
export const navigationQueries = navigationKinds.map((kind) => ({ kind, ...metadata[kind] }))
export type FileQuery = NavigationKind | "hover"

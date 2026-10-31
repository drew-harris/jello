import { Contract, type Context, type MountedSession } from "@opencode/plugin/gui"
import { diffTabID, type DiffTarget } from "./tab"

export const DiffNavigation = Contract.define<{
  open(session: MountedSession, target: DiffTarget): void
}, "jello.jj.diff-navigation">("jello.jj.diff-navigation")

export const diffSessionKey = (session: MountedSession) => `${session.server.id}:${session.id}`

export function openRevisionDiff(ctx: Context, session: MountedSession, target: DiffTarget): void {
  const navigation = ctx.use(DiffNavigation)()
  if (navigation.status === "active") navigation.value.open(session, target)
  else ctx.layout.open(`${ctx.id}:${diffTabID(target)}`, session, { tab: "select" })
}

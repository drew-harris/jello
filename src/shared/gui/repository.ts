import { Contract, type Context, type MountedSession } from "@opencode/plugin/gui"
import { onCleanup } from "solid-js"
import { RepositoryEvents, repositoryKey, type Repository } from "../repository"
import { createActionGate } from "./async-action"

export function createRepositoryServices() {
  const events = new RepositoryEvents()
  const gates = new Map<string, ReturnType<typeof createActionGate>>()
  return {
    events,
    gate(repository: Repository) {
      const key = repositoryKey(repository)
      let gate = gates.get(key)
      if (!gate) { gate = createActionGate(); gates.set(key, gate) }
      return gate
    },
  }
}

export const RepositoryServices = Contract.define<ReturnType<typeof createRepositoryServices>, "jello.repositories">("jello.repositories")
export function repositoryServices(ctx: Context) {
  const live = ctx.use(RepositoryServices)()
  if (live.status !== "active") throw new Error("Repository services are unavailable")
  return live.value
}
export const sessionRepository = (session: MountedSession): Repository => ({ server: session.server.id, directory: session.directory })

export function observeRepository(events: RepositoryEvents, repository: Repository, tags: readonly string[], refresh: () => void) {
  onCleanup(events.subscribe(repository, tags, refresh))
}

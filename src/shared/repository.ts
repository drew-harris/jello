export interface Repository { server: string; directory: string }
export const repositoryKey = (repository: Repository) => JSON.stringify([repository.server, repository.directory])

// Window-owned, not a module singleton. A microtask merges bursts of related
// mutations; callers subscribe only while mounted and explicitly unsubscribe.
export class RepositoryEvents {
  private listeners = new Map<string, Set<(tags: ReadonlySet<string>) => void>>()
  private pending = new Map<string, Set<string>>()
  private scheduled = false

  subscribe(repository: Repository, tags: readonly string[], listener: () => void) {
    const key = repositoryKey(repository)
    const subscribers = this.listeners.get(key) ?? new Set()
    const notify = (changed: ReadonlySet<string>) => { if (tags.some((tag) => changed.has(tag))) listener() }
    subscribers.add(notify)
    this.listeners.set(key, subscribers)
    return () => {
      subscribers.delete(notify)
      if (!subscribers.size && this.listeners.get(key) === subscribers) this.listeners.delete(key)
    }
  }

  invalidate(repository: Repository, tags: readonly string[]) {
    const key = repositoryKey(repository)
    const changed = this.pending.get(key) ?? new Set<string>()
    tags.forEach((tag) => changed.add(tag))
    this.pending.set(key, changed)
    if (this.scheduled) return
    this.scheduled = true
    queueMicrotask(() => {
      this.scheduled = false
      const pending = this.pending
      this.pending = new Map()
      for (const [key, tags] of pending) for (const listener of [...(this.listeners.get(key) ?? [])]) listener(tags)
    })
  }
}

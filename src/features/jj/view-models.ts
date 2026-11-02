import { createRoot, getOwner, onCleanup, type Owner } from "solid-js"

// Models belong to the plugin window, not the component acquiring them. Only
// unused models can be evicted; disposing one also aborts its createLatest work.
export class ViewModels<T> {
  private readonly owner: Owner | null = getOwner()
  private readonly entries = new Map<string, { value: T; dispose(): void; users: number }>()

  constructor(private readonly capacity = 20) {
    onCleanup(() => {
      for (const entry of this.entries.values()) entry.dispose()
      this.entries.clear()
    })
  }

  use(key: string, create: () => T): T {
    let entry = this.entries.get(key)
    if (!entry) {
      entry = createRoot((dispose) => ({ value: create(), dispose, users: 0 }), this.owner)
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    entry.users++
    const retained = entry
    onCleanup(() => { retained.users--; this.trim() })
    this.trim()
    return entry.value
  }

  private trim() {
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= this.capacity) break
      if (entry.users) continue
      entry.dispose()
      this.entries.delete(key)
    }
  }
}

export const repositoryViewKey = (server: string, directory: string) => JSON.stringify([server, directory])

// Window-owned, bounded memory only: keep fetched contents across panel remounts
// without persisting repository contents to the desktop settings store.
export class ViewCache<T> {
  private entries = new Map<string, T>()

  constructor(private readonly capacity = 20) {}

  get(key: string): T | undefined {
    const value = this.entries.get(key)
    if (value !== undefined) {
      this.entries.delete(key)
      this.entries.set(key, value)
    }
    return value
  }

  set(key: string, value: T): T {
    this.entries.delete(key)
    this.entries.set(key, value)
    if (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!)
    return value
  }

  delete(key: string): void {
    this.entries.delete(key)
  }
}

export const repositoryViewKey = (server: string, directory: string) => JSON.stringify([server, directory])

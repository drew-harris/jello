// TTL starts at completion. In-flight reads are shared; failures are never cached.
export class AsyncCache<T> {
  private entries = new Map<string, { expires: number; promise: Promise<T> }>()
  constructor(private readonly ttl: number, private readonly capacity: number, private readonly now = Date.now) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key)
    if (cached && cached.expires > this.now()) {
      this.entries.delete(key)
      this.entries.set(key, cached)
      return cached.promise
    }
    const entry: { expires: number; promise: Promise<T> } = { expires: Infinity, promise: Promise.resolve(undefined as T) }
    entry.promise = Promise.resolve().then(load).then((value) => {
      entry.expires = this.now() + this.ttl
      return value
    }, (error) => {
      if (this.entries.get(key) === entry) this.entries.delete(key)
      throw error
    })
    this.entries.set(key, entry)
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!)
    return entry.promise
  }

  invalidate(key: string) { this.entries.delete(key) }
}

// One consumer's cancellation must not cancel a command shared by other readers.
export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason) }
    const cleanup = () => signal.removeEventListener("abort", abort)
    signal.addEventListener("abort", abort, { once: true })
    promise.then((value) => { cleanup(); resolve(value) }, (error) => { cleanup(); reject(error) })
  })
}

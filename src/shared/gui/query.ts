import { QueryClient, type Query, type QueryKey, type QueryOptions } from "@tanstack/solid-query"
import { createSignal, onCleanup, onMount } from "solid-js"

export function pollDelay(duration: number, failures: number, interval: number, maximum = Math.max(60_000, interval)) {
  return Math.min(maximum, Math.max(interval, Math.min(30_000, duration)) * 2 ** Math.min(failures, 5))
}

// Timing belongs to the cached query, not to any one of its observers.
const timings = new WeakMap<QueryClient, WeakMap<object, { duration: number; failures: number }>>()
export function queryDelay(client: QueryClient, query: object, interval: number) {
  const timing = timings.get(client)?.get(query)
  return pollDelay(timing?.duration ?? 0, timing?.failures ?? 0, interval)
}

export function readQueryOptions<T>(client: QueryClient, queryKey: QueryKey,
  load: (signal: AbortSignal, previous: T | undefined) => Promise<T>,
  options: { interval?: number; poll?(data: T | undefined): boolean; immutable?: boolean } = {},
): QueryOptions<T, unknown> {
  const interval = options.interval ?? 10_000
  const due = (query: { state: { isInvalidated: boolean; status: string; dataUpdatedAt: number; errorUpdatedAt: number } }) =>
    // Query also marks data invalidated on a refresh error. That must not turn
    // every window-focus event into an immediate retry.
    (query.state.isInvalidated && query.state.status !== "error")
    || Date.now() - Math.max(query.state.dataUpdatedAt, query.state.errorUpdatedAt) >= queryDelay(client, query, interval)
  return {
    queryKey,
    queryFn: async ({ signal }) => {
      const query = client.getQueryCache().find({ queryKey, exact: true })!
      let cache = timings.get(client)
      if (!cache) { cache = new WeakMap(); timings.set(client, cache) }
      const timing = cache.get(query) ?? { duration: 0, failures: 0 }
      cache.set(query, timing)
      const started = Date.now()
      try {
        const value = await load(signal, client.getQueryData<T>(queryKey))
        signal.throwIfAborted()
        timing.failures = 0
        return value
      } catch (error) {
        if (!signal.aborted) timing.failures++
        throw error
      } finally { if (!signal.aborted) timing.duration = Date.now() - started }
    },
    staleTime: options.immutable ? Infinity : (query) => {
      // A failed refresh must also wait from completion, not the last success.
      const finished = Math.max(query.state.dataUpdatedAt, query.state.errorUpdatedAt)
      return finished - query.state.dataUpdatedAt + queryDelay(client, query, interval)
    },
    refetchOnMount: options.immutable ? false : (query) => due(query) ? "always" : false,
    refetchOnWindowFocus: options.immutable ? false : (query) =>
      ((options.poll?.(query.state.data as T | undefined) ?? true) || query.state.isInvalidated) && due(query) ? "always" : false,
    // Stop the interval during a request. Query restarts it after completion.
    refetchInterval: options.immutable ? false : (query) => query.state.fetchStatus === "idle"
      && (options.poll?.(query.state.data as T | undefined) ?? true) ? queryDelay(client, query, interval) : false,
  }
}

export function createWindowQueries() {
  const client = new QueryClient({ defaultOptions: { queries: {
    retry: false, retryOnMount: false, throwOnError: false, networkMode: "always", gcTime: 5 * 60_000,
  }, mutations: { retry: false, networkMode: "always" } } })
  // Pierre hydrates cached metadata in place. Do not deep-clone it while
  // publishing query results (the Solid adapter also disables sharing).
  client.setDefaultOptions({ ...client.getDefaultOptions(), queries: {
    ...client.getDefaultOptions().queries, structuralSharing: false,
  } })
  const pending = new Map<string, QueryKey>()
  const followups = new WeakSet<Query>()
  let scheduled = false
  let disposed = false
  client.mount()
  // TanStack listens to visibility changes; desktop window focus also matters.
  const focus = () => { if (!document.hidden) client.getQueryCache().onFocus() }
  if (typeof window !== "undefined") window.addEventListener("focus", focus)
  const dispose = () => {
    if (disposed) return
    disposed = true
    if (typeof window !== "undefined") window.removeEventListener("focus", focus)
    client.unmount()
    client.clear()
  }
  return {
    client, dispose,
    invalidate(prefix: QueryKey) {
      pending.set(JSON.stringify(prefix), prefix)
      if (scheduled) return
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        const prefixes = [...pending.values()]
        pending.clear()
        if (disposed) return
        const queries = new Set(prefixes.flatMap((queryKey) => client.getQueryCache().findAll({ queryKey })))
        for (const query of queries) {
          query.invalidate()
          const refetch = () => {
            if (disposed || client.getQueryCache().get(query.queryHash) !== query) return
            query.invalidate()
            void client.refetchQueries({ predicate: (candidate) => candidate === query, type: "active" }, { cancelRefetch: false })
          }
          if (query.state.fetchStatus === "idle") refetch()
          else if (!followups.has(query)) {
            followups.add(query)
            void query.promise?.catch(() => {}).then(() => { followups.delete(query); refetch() })
          }
        }
      })
    },
  }
}

export type WindowQueries = ReturnType<typeof createWindowQueries>

// Host panels can stay mounted while hidden. Disabled observers retain cached
// data and invalidation, but do not issue background remote commands.
export function createViewVisibility(element: () => HTMLElement) {
  const [visible, setVisible] = createSignal(false)
  onMount(() => {
    const update = () => setVisible(!document.hidden && element().isConnected && !!element().getClientRects().length)
    const observer = new ResizeObserver(update)
    observer.observe(element())
    document.addEventListener("visibilitychange", update)
    update()
    onCleanup(() => { observer.disconnect(); document.removeEventListener("visibilitychange", update) })
  })
  return visible
}

// Reading an initially pending Solid Query's data would suspend its owner.
export const queryData = <T>(query: { isPending: boolean; data: T | undefined }) => query.isPending ? undefined : query.data

import { createLatest } from "@opencode/plugin/gui"
import { createEffect, createSignal, on, untrack } from "solid-js"

export function pollDelay(duration: number, failures: number, interval: number, maximum = Math.max(60_000, interval)) {
  const base = Math.max(interval, Math.min(30_000, duration))
  return Math.min(maximum, base * 2 ** Math.min(failures, 5))
}

// Cached models own resources; mounted views own polling/subscriptions.
export function createResourceModel<Input, Data>(
  load: (input: Input, signal: AbortSignal, previous: Data | undefined) => Promise<Data>,
  options: { equals?(a: Input, b: Input): boolean; interval?: number } = {},
) {
  const [request, setRequest] = createSignal<{ input: Input }>()
  const [lastFinished, setLastFinished] = createSignal(0)
  const [nextDelay, setNextDelay] = createSignal(options.interval ?? 10_000)
  const [stale, setStale] = createSignal(false)
  let failures = 0
  let invalidated = false
  const result = createLatest(request, async ({ input }, signal) => {
    const started = Date.now()
    try {
      const value = await load(input, signal, untrack(() => result.latest))
      signal.throwIfAborted()
      failures = 0
      return value
    } catch (error) {
      if (!signal.aborted) failures++
      throw error
    } finally {
      if (!signal.aborted) {
        setLastFinished(Date.now())
        setNextDelay(pollDelay(Date.now() - started, failures, options.interval ?? 10_000))
      }
    }
  })
  const refresh = () => {
    if (result.loading) return
    invalidated = false
    setStale(false)
    setRequest((previous) => previous && { ...previous })
  }
  createEffect(on(() => result.loading, (loading) => {
    if (!loading && invalidated) { invalidated = false; refresh() }
  }))
  return {
    result, lastFinished, nextDelay, refresh, stale,
    invalidate(options: { defer?: boolean } = {}) {
      setStale(true)
      if (options.defer) return
      if (result.loading) invalidated = true
      else refresh()
    },
    configure(input: Input) {
      const previous = untrack(request)
      if (previous && (options.equals ?? Object.is)(previous.input, input)) return
      invalidated = false
      failures = 0
      setStale(false)
      setRequest({ input })
    },
  }
}

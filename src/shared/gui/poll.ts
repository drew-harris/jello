import { createEffect, on, onCleanup } from "solid-js"

export interface RefreshPolicy {
  loading(): boolean
  enabled(): boolean
  visible(): boolean
  lastFinished(): number
  delay(): number
  stale?(): boolean
  refresh(): void
}

export function shouldRefresh(policy: RefreshPolicy, now: number, force = false) {
  return !policy.loading() && policy.visible()
    && (force || policy.stale?.() || policy.enabled() && now - policy.lastFinished() >= policy.delay())
}

export interface PollingEnvironment {
  now(): number
  schedule(callback: () => void, delay: number): () => void
  focus: EventTarget
  visibility: EventTarget
}

export function createPolling(policy: RefreshPolicy, environment: PollingEnvironment = {
  now: Date.now,
  schedule(callback, delay) { const timer = setTimeout(callback, delay); return () => clearTimeout(timer) },
  focus: window,
  visibility: document,
}) {
  let disposed = false
  let cancel: (() => void) | undefined
  const schedule = () => {
    cancel?.()
    cancel = undefined
    if (!disposed && (policy.enabled() || policy.stale?.()) && !policy.loading()) {
      const remaining = policy.delay() - (environment.now() - policy.lastFinished())
      cancel = environment.schedule(() => refresh(), Math.max(remaining, policy.visible() ? 1 : policy.delay()))
    }
  }
  const refresh = (force = false) => {
    if (disposed) return
    if (shouldRefresh(policy, environment.now(), force)) policy.refresh()
    schedule()
  }
  createEffect(on([policy.loading, policy.enabled, policy.delay, () => policy.stale?.()], schedule))
  const focus = () => refresh()
  environment.focus.addEventListener("focus", focus)
  environment.visibility.addEventListener("visibilitychange", focus)
  onCleanup(() => {
    disposed = true
    cancel?.()
    environment.focus.removeEventListener("focus", focus)
    environment.visibility.removeEventListener("visibilitychange", focus)
  })
  return { refresh }
}

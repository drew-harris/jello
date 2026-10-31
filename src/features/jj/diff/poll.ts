export const DIFF_POLL_INTERVAL = 3_000

// Delay from completion, not start: slow repositories are never hammered by
// queued ticks. Errors add exponential backoff, capped at one minute.
export function diffPollDelay(duration: number, failures: number): number {
  const base = Math.max(DIFF_POLL_INTERVAL, Math.min(30_000, duration))
  return Math.min(60_000, base * 2 ** Math.min(failures, 5))
}

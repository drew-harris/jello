import { pollDelay } from "../../../shared/gui/resource"

export const DIFF_POLL_INTERVAL = 3_000

// Delay from completion, not start: slow repositories are never hammered by
// queued ticks. Errors add exponential backoff, capped at one minute.
export function diffPollDelay(duration: number, failures: number): number {
  return pollDelay(duration, failures, DIFF_POLL_INTERVAL)
}

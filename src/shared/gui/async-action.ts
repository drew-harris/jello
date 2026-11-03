import { createSignal } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { errorMessage } from "../errors"

export function createActionGate() {
  const [pending, setPending] = createSignal(false)
  return {
    pending,
    acquire() {
      if (pending()) throw new Error("Another change operation is still running.")
      setPending(true)
      return () => setPending(false)
    },
  }
}

export function createAsyncAction(options: {
  toast?: Context["toast"]
  gate?: ReturnType<typeof createActionGate>
} = {}) {
  const [pending, setPending] = createSignal(false)
  const [error, setError] = createSignal("")
  return {
    pending, error, clearError: () => setError(""),
    async run<T>(work: () => Promise<T>, feedback: { progress?: string; success?: string; successDescription?: string; failure?: string; rethrow?: boolean; onSuccess?(): void } = {}): Promise<T | undefined> {
      if (pending()) {
        if (feedback.rethrow) throw new Error("Another change operation is still running.")
        return
      }
      let release: (() => void) | undefined
      let progress: { dismiss(): void } | undefined
      setPending(true)
      setError("")
      try {
        release = options.gate?.acquire()
        if (feedback.progress) progress = options.toast?.show({ variant: "loading", title: feedback.progress, persistent: true })
        const result = await work()
        feedback.onSuccess?.()
        if (feedback.success) options.toast?.show({ variant: "success", title: feedback.success, description: feedback.successDescription })
        return result
      } catch (cause) {
        setError(errorMessage(cause))
        if (feedback.failure) options.toast?.show({ variant: "error", title: feedback.failure, description: errorMessage(cause) })
        if (feedback.rethrow) throw cause
      } finally {
        progress?.dismiss()
        release?.()
        setPending(false)
      }
    },
  }
}

import type { Context } from "@opencode/plugin/gui"
import type { ComponentProps } from "solid-js"

export interface Action<T> {
  id: string
  label: string
  icon: ComponentProps<Context["ui"]["Icon"]>["name"]
  description: string
  danger?: boolean
  disabledReason(target: T): string | undefined
  run(target: T, source?: "keyboard" | "menu"): void | Promise<void>
}

export function guardedAction<T>(definition: Action<T>): Action<T> {
  return { ...definition, run(target, source) {
    if (!definition.disabledReason(target)) return definition.run(target, source)
  } }
}

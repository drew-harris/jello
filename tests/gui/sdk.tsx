import type { JSX } from "solid-js"

// Minimal host adapter for real-browser component smoke tests. Production builds
// continue using the app-provided SDK and its real UI components.
const ctx = {
  dialogs: { active: () => false },
  appearance: { mode: () => "light" as const, font: () => "monospace" },
  ui: {
    IconButton(props: { icon: string; label: string; disabled?: boolean; onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent> }) {
      return <button type="button" aria-label={props.label} disabled={props.disabled} onClick={props.onClick}>{props.icon}</button>
    },
  },
}
export const usePlugin = () => ctx

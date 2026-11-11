import { defineConfig } from "vite"
import { gui } from "@opencode/plugin/gui/vite"

// Builds src/gui.tsx into dist/gui-experimental.cjs, the file the "./gui-experimental" export points to.
export default defineConfig(({ mode }) => ({
  plugins: [gui()],
  // Vite library builds otherwise leave this access intact. Plugin windows do
  // not provide Node's process global; TanStack reads it when creating timers.
  define: { "process.env.NODE_ENV": JSON.stringify(mode === "development" ? "development" : "production") },
}))

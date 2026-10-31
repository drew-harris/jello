import { defineConfig } from "vite"
import { gui } from "@opencode/plugin/gui/vite"

// Builds src/gui.tsx into dist/gui-experimental.cjs, the file the "./gui-experimental" export points to.
export default defineConfig({ plugins: [gui()] })

import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import { fileURLToPath } from "node:url"

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [solid()],
  resolve: { alias: { "@opencode/plugin/gui": fileURLToPath(new URL("./sdk.tsx", import.meta.url)) } },
  server: { host: "127.0.0.1", port: 5180, strictPort: true },
})

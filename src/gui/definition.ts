import { Schema } from "effect"
import { Plugin, Store } from "@opencode/plugin/gui"

// Declarations the host reads before either setup runs: stored window state.
// Add `os: ["macos", "linux"]` to limit the plugin to some operating systems.
export const definition = Plugin.define({
  stores: {
    prefs: Store.global(Schema.Struct({ greeting: Schema.String, showStatus: Schema.Boolean }), {
      greeting: "Hello",
      showStatus: true,
    }),
  },
})

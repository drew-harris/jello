import { Schema } from "effect"
import { Plugin, Store } from "@opencode/plugin/gui"

// Declarations the host reads before either setup runs: stored window state.
// Add `os: ["macos", "linux"]` to limit the plugin to some operating systems.
export const definition = Plugin.define({
  stores: {
    jjDiff: Store.global(Schema.Struct({
      layout: Schema.Literals(["unified", "split"]),
      multiFile: Schema.Boolean,
      wrap: Schema.Boolean,
      sidebar: Schema.Boolean,
    }), { layout: "unified", multiFile: false, wrap: true, sidebar: true }),
    jjTreeExpanded: Store.session(Schema.Struct({
      directory: Schema.String,
      changes: Schema.Array(Schema.String),
    }), { directory: "", changes: [] }),
    jjTree: Store.session(Schema.Struct({
      directory: Schema.String,
      commitID: Schema.String,
      changeID: Schema.String,
      limit: Schema.Number,
    }), { directory: "", commitID: "", changeID: "", limit: 100 }),
    prefs: Store.global(Schema.Struct({ greeting: Schema.String }), {
      greeting: "Hello",
    }),
  },
})

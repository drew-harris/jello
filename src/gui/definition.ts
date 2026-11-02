import { Schema } from "effect"
import { Plugin, Store } from "@opencode/plugin/gui"

export const DIFF_FONT_SIZE_DEFAULT = 13
export const DIFF_FONT_SIZE_MIN = 8
export const DIFF_FONT_SIZE_MAX = 32

export function normalizeDiffFontSize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DIFF_FONT_SIZE_DEFAULT
  return Math.min(DIFF_FONT_SIZE_MAX, Math.max(DIFF_FONT_SIZE_MIN, Math.round(value)))
}

// Declarations the host reads before either setup runs: stored window state.
// Add `os: ["macos", "linux"]` to limit the plugin to some operating systems.
export const definition = Plugin.define({
  stores: {
    jjDiff: Store.global(Schema.Struct({
      layout: Schema.Literals(["unified", "split"]),
      multiFile: Schema.Boolean,
      wrap: Schema.Boolean,
      sidebar: Schema.Boolean,
      // Optional so preferences saved by older plugin versions still decode.
      fontSize: Schema.optional(Schema.Number),
    }), { layout: "unified", multiFile: false, wrap: true, sidebar: true, fontSize: DIFF_FONT_SIZE_DEFAULT }),
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
    prefs: Store.global(Schema.Struct({ greeting: Schema.String, showStatusBar: Schema.Boolean }), {
      greeting: "Hello",
      showStatusBar: true,
    }),
  },
})

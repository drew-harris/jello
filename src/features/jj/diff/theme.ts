import { registerCustomTheme } from "@pierre/diffs"
import { sonokai } from "../../../gui/themes/sonokai"

export function registerDiffThemes() {
  for (const mode of ["dark", "light"] as const) {
    const colors = sonokai[mode].overrides
    registerCustomTheme(`jello-jj-${mode}`, async () => ({
      name: `jello-jj-${mode}`,
      type: mode,
      colors: { "editor.background": colors["background-base"], "editor.foreground": colors["text-base"] },
      tokenColors: [
        { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: colors["syntax-comment"] } },
        { scope: ["keyword", "storage", "entity.name.tag"], settings: { foreground: colors["syntax-keyword"] } },
        { scope: ["entity.name.function", "support.function"], settings: { foreground: mode === "dark" ? "#9ed072" : "#002cc4" } },
        { scope: ["string", "markup.inline.raw"], settings: { foreground: colors["syntax-string"] } },
        { scope: ["entity.name.type", "support.type"], settings: { foreground: colors["syntax-type"] } },
        { scope: ["entity.name.type.class", "support.class"], settings: { foreground: colors["syntax-object"] } },
        { scope: ["constant.numeric", "constant.language"], settings: { foreground: colors["syntax-primitive"] } },
        { scope: ["constant.other"], settings: { foreground: colors["syntax-constant"] } },
        { scope: ["variable.other.property", "support.variable.property", "entity.other.attribute-name"], settings: { foreground: colors["syntax-property"] } },
        { scope: ["punctuation", "meta.brace"], settings: { foreground: mode === "dark" ? sonokai.dark.overrides["syntax-punctuation"] : "#383a42" } },
        { scope: ["markup.heading"], settings: { foreground: colors["syntax-keyword"], fontStyle: "bold" } },
      ],
    }))
  }
}

// Static, plugin-owned CSS scoped to Pierre's shadow root (not repository content).
export function diffThemeCSS(dark: boolean): string {
  return `:host {
    --diffs-bg: var(--background-base, ${dark ? "#202020" : "#ffffff"});
    --diffs-bg-context: var(--diffs-bg);
    --diffs-bg-context-gutter: var(--surface-inset-base, ${dark ? "#1b1b1b" : "#fafafa"});
    --diffs-bg-buffer: var(--diffs-bg);
    --diffs-bg-separator: var(--surface-raised-base, ${dark ? "#292929" : "#fafafa"});
    --diffs-bg-addition: ${dark ? "#18251b" : "#edf7ee"};
    --diffs-bg-deletion: ${dark ? "#2b1c1c" : "#fceeee"};
    --diffs-bg-addition-number-override: var(--diffs-bg-addition);
    --diffs-bg-deletion-number-override: var(--diffs-bg-deletion);
    --diffs-bg-addition-emphasis: ${dark ? "#284f33" : "#c8e8cd"};
    --diffs-bg-deletion-emphasis: ${dark ? "#693131" : "#f4cccc"};
    --diffs-fg-number: ${dark ? "#7b7b7b" : "#888888"};
    --diffs-gap-block: 0px;
  }
  [data-separator] { border-radius: 0; margin-block: 0; }
  [data-separator-wrapper] { border-radius: 0; }
  [data-separator=line-info-basic] { height: 24px; }
  [data-line-type] { border-radius: 0; }
  :host(:focus-visible), [data-code]:focus-visible, pre:focus-visible { outline: none; box-shadow: none; }
  /* Soften only code-row fills; keep gutter, numbers and word emphasis intact. */
  [data-line][data-line-type=change-addition] {
    --diffs-bg-addition-override: color-mix(in srgb, var(--diffs-addition-base) 70%, var(--diffs-bg));
  }
  [data-line][data-line-type=change-deletion] {
    --diffs-bg-deletion-override: color-mix(in srgb, var(--diffs-deletion-base) 70%, var(--diffs-bg));
  }`
}

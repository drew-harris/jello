import { registerCustomTheme } from "@pierre/diffs"

export function registerDiffThemes() {
  for (const mode of ["dark", "light"] as const) {
    const dark = mode === "dark"
    registerCustomTheme(`jello-jj-${mode}`, async () => ({
      name: `jello-jj-${mode}`,
      type: mode,
      colors: { "editor.background": dark ? "#151515" : "#ffffff", "editor.foreground": dark ? "#dddddd" : "#242424" },
      tokenColors: [
        { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: dark ? "#808080" : "#808080" } },
        { scope: ["keyword", "storage", "entity.name.function", "support.function"], settings: { foreground: dark ? "#e99bc4" : "#a03779" } },
        { scope: ["string", "markup.inline.raw"], settings: { foreground: dark ? "#a5d6a7" : "#35743a" } },
        { scope: ["entity.name.type", "support.type", "support.class", "entity.name.tag", "constant.language"], settings: { foreground: dark ? "#b5a5ed" : "#7056aa" } },
        { scope: ["constant.numeric", "constant.other", "entity.other.attribute-name"], settings: { foreground: dark ? "#e5b583" : "#9b632b" } },
        { scope: ["punctuation", "meta.brace"], settings: { foreground: dark ? "#939393" : "#707070" } },
        { scope: ["markup.heading"], settings: { foreground: dark ? "#e99bc4" : "#a03779", fontStyle: "bold" } },
      ],
    }))
  }
}

// Static, plugin-owned CSS scoped to Pierre's shadow root (not repository content).
export function diffThemeCSS(dark: boolean): string {
  return `:host {
    --diffs-bg: ${dark ? "#151515" : "#ffffff"};
    --diffs-bg-context: var(--diffs-bg);
    --diffs-bg-context-gutter: var(--diffs-bg);
    --diffs-bg-buffer: var(--diffs-bg);
    --diffs-bg-separator: ${dark ? "#202020" : "#f3f3f3"};
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
  [data-line-type] { border-radius: 0; }`
}

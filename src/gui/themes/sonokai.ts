import type { Theme } from "@opencode/plugin/gui"

/*!
 * Zed Sonokai — MIT License
 * Copyright (c) 2025 ciathefed
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// Zed Sonokai by ciathefed (https://github.com/ciathefed/zed-sonokai),
// with Drew's ~/dev-env/dots/.config/zed/settings.json overrides.
// OpenCode has fewer syntax categories: class maps to object, and numbers /
// booleans share primitive. Font styles and Zed-only tokens are not portable.
export const sonokai = {
  name: "Sonokai",
  id: "sonokai",
  // Zed's configured light counterpart is One Light, not an inverted Sonokai.
  light: {
    palette: {
      neutral: "#ffffff",
      ink: "#000000",
      primary: "#1487db",
      accent: "#a500b8",
      success: "#1cc95c",
      warning: "#db9300",
      error: "#c41e0c",
      info: "#0058a1",
    },
    overrides: {
      "background-base": "#ffffff",
      "background-weak": "#fafafa",
      "border-base": "#d6d6d6",
      "text-base": "#000000",
      "text-weak": "#696969",
      "syntax-comment": "#828282",
      "syntax-keyword": "#a500b8",
      "syntax-string": "#198500",
      "syntax-regexp": "#198500",
      "syntax-primitive": "#b36000",
      "syntax-variable": "#383a42",
      "syntax-property": "#c41e0c",
      "syntax-type": "#0058a1",
      "syntax-constant": "#db9300",
      "syntax-object": "#193bc2",
    },
  },
  dark: {
    palette: {
      neutral: "#202020",
      ink: "#e2e2e2",
      primary: "#76cce0",
      accent: "#b39df3",
      success: "#9ed072",
      warning: "#e7c664",
      error: "#fc5d7c",
      info: "#76cce0",
    },
    overrides: {
      "background-base": "#202020",
      "background-weak": "#191919",
      "background-strong": "#242424",
      "background-stronger": "#292929",
      "surface-base": "#242424",
      "surface-base-hover": "#303030",
      "surface-base-active": "#363636",
      "surface-inset-base": "#1b1b1b",
      "surface-raised-base": "#292929",
      "surface-raised-base-hover": "#303030",
      "surface-float-base": "#303030",
      "surface-float-base-hover": "#383838",
      "surface-diff-unchanged-base": "#202020",
      "surface-warning-weak": "#2e2d24",
      "surface-critical-weak": "#793336",
      "input-base": "#1b1b1b",
      "input-hover": "#303030",
      "text-base": "#e2e2e2",
      "text-strong": "#e2e2e2",
      "text-weak": "#bfbfbf",
      "text-weaker": "#858585",
      "icon-base": "#e2e2e2",
      "border-base": "#3b3b3b",
      "border-weak-base": "#303030",
      "border-selected": "#737373",
      "border-focus": "#737373",
      "syntax-comment": "#7f8490",
      "syntax-keyword": "#fc5d7c",
      "syntax-string": "#e7c664",
      "syntax-regexp": "#e7c664",
      "syntax-primitive": "#b39df3",
      "syntax-variable": "#e2e2e3",
      "syntax-property": "#ef8f62",
      "syntax-type": "#76cce0",
      "syntax-constant": "#b39df3",
      "syntax-operator": "#fc5d7c",
      "syntax-punctuation": "#7f8490",
      "syntax-object": "#ff00ff",
    },
    v2Overrides: {
      "v2-background-bg-base": "#202020",
      "v2-background-bg-deep": "#191919",
      "v2-background-bg-layer-01": "#242424",
      "v2-background-bg-layer-02": "#292929",
      "v2-background-bg-layer-03": "#303030",
      "v2-background-bg-layer-04": "#383838",
      "v2-border-border-base": "#3b3b3b",
      "v2-border-border-muted": "#303030",
      "v2-border-border-strong": "#737373",
      "v2-border-border-focus": "#737373",
      "v2-elevation-raised": "0 2px 6px #00000030, 0 0 0 1px #ffffff08",
      "v2-elevation-floating": "0 8px 24px #00000050, 0 0 0 1px #ffffff0f",
      "v2-elevation-overlay": "0 16px 48px #00000070, 0 0 0 1px #ffffff14",
      "v2-state-bg-warning": "#2e2d24",
      "v2-state-bg-danger": "#793336",
    },
  },
} satisfies Theme

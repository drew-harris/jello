import { strict as assert } from "node:assert"
import { test } from "node:test"
import { previewSegments } from "./preview"
import { getFiletypeFromFileName, getSharedHighlighter } from "@pierre/diffs"
import { registerDiffThemes } from "../theme"

test("peek syntax tokens retain colors while splitting the highlighted symbol", () => {
  const result = previewSegments("const value = 1", [
    { content: "const ", offset: 0, color: "pink" },
    { content: "value = ", offset: 6, color: "white" },
    { content: "1", offset: 14, color: "orange" },
  ], 6, 11)
  assert.equal(result.map((segment) => segment.text).join(""), "const value = 1")
  assert.deepEqual(result.filter((segment) => segment.highlighted).map(({ text, color }) => ({ text, color })), [{ text: "value", color: "white" }])
  assert.equal(result[0].color, "pink")
  assert.equal(result.at(-1)?.color, "orange")
})

test("peek highlighting safely falls back to plain text, retaining UTF-16 positions and empty rows", () => {
  const line = "😀 value <tag>"
  const result = previewSegments(line, undefined, 3, 8)
  assert.equal(result.map((segment) => segment.text).join(""), line)
  assert.deepEqual(result.filter((segment) => segment.highlighted).map((segment) => segment.text), ["value"])
  assert.equal(previewSegments("", undefined, -1, -1)[0].text, " ")
  assert.equal(previewSegments("text", undefined, -1, -1).some((segment) => segment.highlighted), false)
})

test("peek previews use the diff viewer's shared TypeScript grammar and light/dark palettes", async () => {
  registerDiffThemes()
  const lang = getFiletypeFromFileName("component.tsx")
  for (const theme of ["jello-jj-light", "jello-jj-dark"] as const) {
    const highlighter = await getSharedHighlighter({ themes: [theme], langs: [lang] })
    const { tokens } = highlighter.codeToTokens('const value = "hello"', { lang, theme })
    assert.equal(tokens[0].map((token) => token.content).join(""), 'const value = "hello"')
    assert.ok(new Set(tokens[0].map((token) => token.color)).size > 1)
  }
})

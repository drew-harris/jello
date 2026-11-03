import { strict as assert } from "node:assert"
import { test } from "node:test"
import { getFiletypeFromFileName, getSharedHighlighter } from "@pierre/diffs"
import { registerDiffThemes } from "../jj/diff/theme"
import { sourceItem, sourceScrollTarget } from "./file-rendering"

test("file renderer receives all source content and a versioned native file item", () => {
  const document = { path: "/repo/main.ts", text: "// first\n".repeat(1000) + "// last\n", queryable: true }
  const item = sourceItem(document, 2)
  assert.equal(item.type, "file")
  assert.equal(item.id, document.path)
  assert.equal(item.file.contents, document.text)
  assert.equal(item.version, 2)
})

test("navigation translates zero-based LSP lines and clamps stale targets to the full file", () => {
  const document = { path: "/repo/main.ts", text: "first\r\nsecond\r\nthird\r\n", queryable: true }
  const location = { path: document.path, line: 1, character: 0, endLine: 1, endCharacter: 4 }
  assert.equal(sourceScrollTarget(document, location).lineNumber, 2)
  assert.equal(sourceScrollTarget(document, { ...location, line: 1000 }).lineNumber, 3)
  assert.equal(sourceScrollTarget({ ...document, text: "" }, location).lineNumber, 1)
})

test("file views retain the diff's shared TypeScript grammar and light/dark palettes", async () => {
  registerDiffThemes()
  const lang = getFiletypeFromFileName("component.tsx")
  for (const theme of ["jello-jj-light", "jello-jj-dark"] as const) {
    const highlighter = await getSharedHighlighter({ themes: [theme], langs: [lang] })
    // Allow cold grammar initialization in this standalone test process.
    const { tokens } = highlighter.codeToTokens('const value = "hello"', { lang, theme, tokenizeTimeLimit: 1000 })
    assert.equal(tokens[0].map((token) => token.content).join(""), 'const value = "hello"')
    assert.ok(new Set(tokens[0].map((token) => token.color)).size > 1)
  }
})

import { strict as assert } from "node:assert"
import { describe, test } from "node:test"
import { sonokai } from "./sonokai"

describe("Sonokai theme", () => {
  test("provides valid palette colors and literal overrides for both schemes", () => {
    for (const variant of [sonokai.light, sonokai.dark]) {
      for (const color of Object.values(variant.palette)) {
        assert.match(color, /^#[0-9a-f]{6}$/i)
      }
      for (const color of Object.values(variant.overrides)) {
        assert.match(color, /^#[0-9a-f]{6}$/i)
      }
    }
  })

  test("preserves the personal Zed overrides on both token generations", () => {
    assert.equal(sonokai.dark.overrides["background-base"], "#202020")
    assert.equal(sonokai.dark.v2Overrides["v2-background-bg-base"], "#202020")
    assert.equal(sonokai.dark.overrides["syntax-property"], "#ef8f62")
    assert.equal(sonokai.dark.overrides["syntax-object"], "#ff00ff")
    assert.equal(sonokai.dark.overrides["border-selected"], "#737373")
  })

  test("uses the configured One Light counterpart in light mode", () => {
    assert.equal(sonokai.light.palette.neutral, "#ffffff")
    assert.equal(sonokai.light.overrides["syntax-keyword"], "#a500b8")
  })

  test("keeps UI text neutral rather than blue-grey", () => {
    for (const color of [
      sonokai.dark.palette.ink,
      sonokai.dark.overrides["text-base"],
      sonokai.dark.overrides["text-strong"],
      sonokai.dark.overrides["text-weak"],
      sonokai.dark.overrides["text-weaker"],
    ]) {
      assert.equal(color.slice(1, 3), color.slice(3, 5))
      assert.equal(color.slice(3, 5), color.slice(5, 7))
    }
  })
})

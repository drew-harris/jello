import { strict as assert } from "node:assert"
import { test } from "node:test"
import { createRoot, createSignal, onCleanup } from "solid-js"
import { repositoryViewKey, ViewModels } from "./view-models"

test("models and their signals survive the subscribing component's cleanup", () => {
  createRoot((disposeWindow) => {
    const models = new ViewModels<ReturnType<typeof createSignal<number>>>()
    let first!: ReturnType<typeof createSignal<number>>
    createRoot((unmount) => {
      first = models.use("repo", () => createSignal(0))
      first[1](3)
      unmount()
    })
    createRoot((unmount) => {
      const next = models.use("repo", () => { throw new Error("must reuse model") })
      assert.equal(next, first)
      assert.equal(next[0](), 3)
      unmount()
    })
    disposeWindow()
  })
})

test("only unused models are evicted, and window cleanup disposes retained models", () => {
  const disposed: string[] = []
  const make = (key: string) => {
    onCleanup(() => disposed.push(key))
    return key
  }
  createRoot((disposeWindow) => {
    const models = new ViewModels<string>(1)
    createRoot((unmountActive) => {
      models.use("active", () => make("active"))
      createRoot((unmountOther) => {
        models.use("other", () => make("other"))
        assert.deepEqual(disposed, [])
        unmountOther()
      })
      assert.deepEqual(disposed, ["other"])
      unmountActive()
    })
    disposeWindow()
    assert.deepEqual(disposed, ["other", "active"])
  })
})

test("repository keys isolate servers and delimiter-containing paths", () => {
  const keys = [repositoryViewKey("a", "b:c"), repositoryViewKey("a:b", "c"),
    repositoryViewKey("a", "/other"), repositoryViewKey("remote", "b:c")]
  assert.equal(new Set(keys).size, keys.length)
})

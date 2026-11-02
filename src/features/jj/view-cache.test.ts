import { strict as assert } from "node:assert"
import { test } from "node:test"
import { repositoryViewKey, ViewCache } from "./view-cache"

test("retains the same fetched contents across view lifetimes", () => {
  const cache = new ViewCache<{ files: string[] }>()
  const key = repositoryViewKey("remote", "/repo")
  const contents = { files: ["file.ts"] }
  cache.set(key, contents)
  assert.equal(cache.get(key), contents)
  assert.equal(cache.get(key), contents)
})

test("isolates repositories, servers, and delimiter-containing paths", () => {
  const keys = [repositoryViewKey("a", "b:c"), repositoryViewKey("a:b", "c"),
    repositoryViewKey("a", "/other"), repositoryViewKey("remote", "b:c")]
  assert.equal(new Set(keys).size, keys.length)
  const cache = new ViewCache<number>()
  keys.forEach((key, index) => cache.set(key, index))
  keys.forEach((key, index) => assert.equal(cache.get(key), index))
})

test("bounds retained contents and evicts least recently used entries", () => {
  const cache = new ViewCache<number>(2)
  cache.set("old", 1)
  cache.set("used", 2)
  cache.get("old")
  cache.set("new", 3)
  assert.equal(cache.get("used"), undefined)
  assert.equal(cache.get("old"), 1)
  cache.set("old", 4)
  assert.equal(cache.get("new"), 3)
  assert.equal(cache.get("old"), 4)
  cache.delete("old")
  assert.equal(cache.get("old"), undefined)
})

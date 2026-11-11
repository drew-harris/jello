import { strict as assert } from "node:assert"
import { test } from "node:test"
import { repositoryKey } from "./repository"

test("repository identity includes server and directory without delimiter collisions", () => {
  assert.equal(new Set([
    repositoryKey({ server: "a:b", directory: "c" }), repositoryKey({ server: "a", directory: "b:c" }),
    repositoryKey({ server: "a", directory: "/repo" }), repositoryKey({ server: "b", directory: "/repo" }),
  ]).size, 4)
})

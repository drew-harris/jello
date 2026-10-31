import { strict as assert } from "node:assert"
import { test } from "node:test"
import { buildFileTree } from "./tree"

test("groups folders before files and preserves original file indices", () => {
  const tree = buildFileTree([{ name: "README.md" }, { name: "src/z.ts" }, { name: "src/a.ts" }])
  assert.deepEqual(tree.map((node) => node.name), ["src", "README.md"])
  assert.deepEqual(tree[0].children.map(({ name, index }) => ({ name, index })), [{ name: "a.ts", index: 2 }, { name: "z.ts", index: 1 }])
})

test("filtering prunes empty folders and matches renamed paths", () => {
  const files = [{ name: "src/new.ts", prevName: "src/old.ts" }, { name: "tests/other.ts" }]
  const tree = buildFileTree(files, "OLD")
  assert.equal(tree.length, 1)
  assert.equal(tree[0].children[0].index, 0)
  assert.deepEqual(buildFileTree(files, "missing"), [])
})

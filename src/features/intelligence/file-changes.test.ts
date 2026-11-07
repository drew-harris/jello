import { strict as assert } from "node:assert"
import { test } from "node:test"
import { changeHunkLines, mergeMarkers, paintGutter, patchMarkers, type FileChange } from "./file-changes"

function gutter(lines: number[]) {
  const cells = lines.map((line) => ({
    dataset: { columnNumber: String(line + 1) } as Record<string, string>,
    title: "",
    attributes: new Set<string>(),
    toggleAttribute(name: string, force: boolean) { if (force) this.attributes.add(name); else this.attributes.delete(name) },
    removeAttribute(name: string) { this.attributes.delete(name); if (name === "title") this.title = "" },
  }))
  const root = { querySelectorAll: () => cells } as unknown as ParentNode
  return { cells, root }
}

test("gutter outlines cap only the ends of contiguous runs, including virtualized rows", () => {
  const markers: FileChange[] = [0, 1, 2, 3, 4].map((line) => ({ line, kind: "added", layer: "branch" }))
  const { root, cells } = gutter([0, 1, 2, 3, 4])
  paintGutter(root, markers)
  assert.deepEqual(cells.map((cell) => [...cell.attributes]), [
    ["data-jello-change-start"], [], [], [], ["data-jello-change-end"],
  ])
  const virtual = gutter([2])
  paintGutter(virtual.root, markers)
  assert.deepEqual([...virtual.cells[0].attributes], [])
  paintGutter(root, [])
  assert.ok(cells.every((cell) => cell.attributes.size === 0 && !cell.dataset.jelloChange && !cell.dataset.jelloLayer && !cell.title))
})

test("gutter runs break at gaps, layer or kind changes, and deletion markers", () => {
  const markers: FileChange[] = [
    { line: 0, kind: "added", layer: "branch" },
    { line: 1, kind: "added", layer: "current" },
    { line: 2, kind: "modified", layer: "current" },
    { line: 4, kind: "modified", layer: "current" },
    { line: 5, kind: "deleted", layer: "current" },
    { line: 6, kind: "deleted", layer: "current" },
  ]
  const { root, cells } = gutter(markers.map((marker) => marker.line))
  paintGutter(root, markers)
  assert.ok(cells.every((cell) => cell.attributes.has("data-jello-change-start") && cell.attributes.has("data-jello-change-end")))
  // Repainting a recycled gutter row must also remove obsolete end caps.
  paintGutter(root, [0, 1, 2].map((line) => ({ line, kind: "added", layer: "branch" })))
  assert.deepEqual([...cells[1].attributes], [])
})

test("source hunk navigation groups sorted contiguous signs across both layers", () => {
  const markers: FileChange[] = [
    { line: 20, kind: "deleted", layer: "current" },
    { line: 4, kind: "modified", layer: "current" },
    { line: 3, kind: "added", layer: "branch" },
    { line: 4, kind: "added", layer: "branch" },
    { line: 0, kind: "deleted", layer: "branch" },
  ]
  assert.deepEqual(changeHunkLines(markers), [0, 3, 20])
  assert.deepEqual(changeHunkLines([]), [])
  assert.equal(markers[0].line, 20)
})

test("zero-context markers distinguish replacement, insertion and deletion anchors", () => {
  assert.deepEqual(patchMarkers("@@ -2 +2,2 @@\n-old\n+new\n+extra\n@@ -5,2 +6,0 @@\n-a\n-b\n@@ -0,0 +1 @@\n+first\n", "current", 10), [
    { line: 1, kind: "modified", layer: "current" },
    { line: 2, kind: "added", layer: "current" },
    { line: 5, kind: "deleted", layer: "current" },
    { line: 0, kind: "added", layer: "current" },
  ])
  assert.equal(patchMarkers("@@ -1 +0,0 @@", "branch", 1)[0]!.line, 0)
  assert.equal(patchMarkers("@@ -9 +8,0 @@", "branch", 3)[0]!.line, 2)
  assert.deepEqual(patchMarkers("Binary files differ", "branch", 3), [])
})

test("current change markers win overlapping branch markers", () => {
  const branch = patchMarkers("@@ -1,2 +1,2 @@", "branch", 5)
  const current = patchMarkers("@@ -2 +2 @@", "current", 5)
  assert.deepEqual(mergeMarkers(branch, current), [branch[0], current[0]])
})

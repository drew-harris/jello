import { strict as assert } from "node:assert"
import { test } from "node:test"
import { fileStart, openFileClick } from "./file-open"

function click(modifiers: { metaKey?: boolean; ctrlKey?: boolean; button?: number } = {}) {
  const event = Object.assign(new Event("click", { cancelable: true }), { button: 0, metaKey: false, ctrlKey: false, ...modifiers }) as MouseEvent
  return event
}

test("Cmd/Ctrl-click opens a filename without triggering ordinary selection or copy", () => {
  const opened: string[] = []
  for (const modifiers of [{ metaKey: true }, { ctrlKey: true }]) {
    const event = click(modifiers)
    assert.equal(openFileClick(event, "src/a file.ts", (path) => opened.push(path)), true)
    assert.equal(event.defaultPrevented, true)
    assert.equal(event.cancelBubble, true)
  }
  assert.deepEqual(opened, ["src/a file.ts", "src/a file.ts"])
})

test("ordinary and non-primary filename clicks retain their original behavior", () => {
  for (const modifiers of [{}, { metaKey: true, button: 1 }, { ctrlKey: true, button: 2 }]) {
    const event = click(modifiers)
    assert.equal(openFileClick(event, "a.ts", () => assert.fail("must not open file")), false)
    assert.equal(event.defaultPrevented, false)
  }
})

test("filename launches seed the entire-file viewer at the top of the workspace file", () => {
  for (const directory of ["/repo", "/repo/"]) {
    assert.deepEqual(fileStart(directory, "src/a file.ts"), {
      path: "/repo/src/a file.ts", line: 0, character: 0, endLine: 0, endCharacter: 0,
    })
  }
  assert.equal(fileStart("/", "a.ts").path, "/a.ts")
})

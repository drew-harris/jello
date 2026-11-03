import { strict as assert } from "node:assert"
import { createHash } from "node:crypto"
import { test } from "node:test"
import { verifiedFileChanges } from "./file-changes"

test("gutter patches require an exact content hash, including newline differences", async () => {
  const document = { path: "/repo/a.ts", text: "new\n", queryable: true }
  const data = { current: "@@ -1 +1 @@\n-old\n+new\n", branch: "@@ -1 +1 @@\n-old\n+new\n",
    hash: createHash("sha256").update(document.text).digest("hex"), note: "" }
  assert.deepEqual((await verifiedFileChanges(document, data)).markers, [{ line: 0, kind: "modified", layer: "current" }])
  for (const text of ["old\n", "new", "new\r\n"]) {
    const stale = await verifiedFileChanges({ ...document, text }, data)
    assert.deepEqual(stale.markers, [])
    assert.match(stale.note, /differs/)
  }
  assert.deepEqual(await verifiedFileChanges(document, { ...data, hash: "", note: "Outside repository" }), { markers: [], note: "Outside repository" })
})

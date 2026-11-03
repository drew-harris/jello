import { strict as assert } from "node:assert"
import { test } from "node:test"
import { createRoot } from "solid-js"
import { isServer } from "solid-js/web"
import type { LanguageClient } from "./client"
import { createFileViewModel } from "./file-model"
import type { PeekLocation, SourceDocument, SymbolPosition } from "./rpc"

const line = "const value = 1"
const location = (path = "/repo/a.ts", row = 0): PeekLocation => ({ path, line: row, character: 6, endLine: row, endCharacter: 11 })
const position = (path = "/repo/a.ts"): SymbolPosition => ({ path, line: 0, character: 6, text: "value", expectedLine: line })
const document = (path: string): SourceDocument => ({ path, text: `${line}\n${line}\n`, queryable: true })
const client = (overrides: Partial<LanguageClient> = {}): LanguageClient => ({
  document: async (path) => document(path),
  lookup: async () => ({ locations: [], truncated: false }),
  hover: async () => ({ text: "const value: 1" }),
  ...overrides,
})
const modelRoot = (transport: LanguageClient) => {
  let dispose!: () => void
  const model = createRoot((cleanup) => { dispose = cleanup; return createFileViewModel(transport) })
  return { model, dispose }
}

test("file navigation loads full documents, caches visits and supports back/forward branching", { skip: isServer }, async () => {
  const reads: string[] = []
  const { model, dispose } = modelRoot(client({ document: async (path) => {
    reads.push(path)
    return { path, text: Array.from({ length: 400 }, (_, index) => `line ${index}`).join("\n"), queryable: true }
  } }))
  try {
    await model.navigate(location("/repo/a.ts", 200))
    assert.equal(model.document()!.text.split("\n").length, 400)
    assert.match(model.document()!.text, /line 399$/)
    await model.navigate(location("/repo/b.ts"))
    await model.back()
    assert.equal(model.document()!.path, "/repo/a.ts")
    assert.equal(model.location()!.line, 200)
    await model.forward()
    assert.equal(model.document()!.path, "/repo/b.ts")
    assert.deepEqual(reads, ["/repo/a.ts", "/repo/b.ts"])
    await model.back()
    await model.navigate(location("/repo/c.ts"))
    assert.equal(model.canForward(), false)
  } finally { dispose() }
})

test("Escape goes back exactly one navigation level before dismissing selection or the peek", { skip: isServer }, async () => {
  const { model, dispose } = modelRoot(client())
  try {
    await model.navigate(location())
    await model.navigate(location("/repo/b.ts"))
    await model.navigate(location("/repo/c.ts"))
    await model.choose(position("/repo/c.ts"))
    await model.query("hover")
    assert.equal(model.escape(), true)
    assert.equal(model.location()!.path, "/repo/b.ts")
    assert.equal(model.document()!.path, "/repo/b.ts")
    assert.equal(model.hover(), undefined)
    assert.equal(model.escape(), true)
    assert.equal(model.location()!.path, "/repo/a.ts")
    assert.equal(model.canBack(), false)
    assert.equal(model.escape(), false, "only the root lets Escape reach the containing modal")
    await model.forward()
    assert.equal(model.location()!.path, "/repo/b.ts", "Escape preserves forward navigation")
  } finally { dispose() }
})

test("at the navigation root Escape retains hover/selection dismissal before closing", { skip: isServer }, async () => {
  const { model, dispose } = modelRoot(client())
  try {
    await model.navigate(location())
    await model.choose(position())
    await model.query("hover")
    assert.equal(model.escape(), true)
    assert.equal(model.hover(), undefined)
    assert.ok(model.target())
    assert.equal(model.escape(), true)
    assert.equal(model.target(), undefined)
    assert.equal(model.escape(), false)
  } finally { dispose() }
})

test("location query kinds share results and allow continued navigation from the viewed file", { skip: isServer }, async () => {
  const calls: Array<{ kind: string; path: string }> = []
  const { model, dispose } = modelRoot(client({ lookup: async (position, kind) => {
    calls.push({ kind, path: position.path })
    return { locations: kind === "documentHighlight" ? [location(position.path)] : [location("/repo/b.ts")], truncated: false }
  } }))
  try {
    await model.seed({ label: "Original definition", locations: [location()], truncated: false })
    for (const kind of ["definition", "references", "typeDefinition", "implementation"] as const) {
      await model.choose(position(model.document()!.path))
      await model.query(kind)
      assert.equal(model.document()!.path, "/repo/b.ts")
      assert.equal(model.results()!.locations[0].path, "/repo/b.ts")
      assert.equal(model.queryLoading(), false)
    }
    assert.ok(calls.some((call) => call.kind === "implementation" && call.path === "/repo/b.ts"))
    await model.choose(position("/repo/b.ts"))
    assert.equal(model.occurrences().length, 1)
    await model.query("hover")
    assert.equal(model.hover(), "const value: 1")
    model.dismissHover()
    assert.equal(model.hover(), undefined)
  } finally { dispose() }
})

test("multiple results retain their list while moving between full files", { skip: isServer }, async () => {
  const { model, dispose } = modelRoot(client())
  const results = { label: "References", locations: [location(), location("/repo/b.ts")], truncated: true }
  try {
    await model.seed(results)
    await model.selectResult(1)
    assert.equal(model.document()!.path, "/repo/b.ts")
    assert.equal(model.results(), results)
    await model.back()
    assert.equal(model.document()!.path, "/repo/a.ts")
    assert.equal(model.results(), results)
  } finally { dispose() }
})

test("navigation cancels superseded document loads and disposal prevents late publication", { skip: isServer }, async () => {
  const reads: Array<{ path: string; signal: AbortSignal; resolve(value: SourceDocument): void }> = []
  const { model, dispose } = modelRoot(client({ document: (path, signal) => new Promise((resolve) => reads.push({ path, signal, resolve })) }))
  const first = model.navigate(location())
  const second = model.navigate(location("/repo/b.ts"))
  assert.equal(reads[0].signal.aborted, true)
  reads[1].resolve(document("/repo/b.ts"))
  await second
  reads[0].resolve(document("/repo/a.ts"))
  await first
  assert.equal(model.document()!.path, "/repo/b.ts")
  const pending = model.navigate(location("/repo/c.ts"))
  dispose()
  assert.equal(reads[2].signal.aborted, true)
  reads[2].resolve(document("/repo/c.ts"))
  await pending
  assert.equal(model.document(), undefined)
})

test("old query responses cannot navigate after the selected symbol changes", { skip: isServer }, async () => {
  let resolve!: (value: { locations: PeekLocation[]; truncated: boolean }) => void
  let querySignal!: AbortSignal
  const { model, dispose } = modelRoot(client({ lookup: async (_position, kind, signal) => {
    if (kind === "documentHighlight") return { locations: [], truncated: false }
    querySignal = signal
    return new Promise((yes) => { resolve = yes })
  } }))
  try {
    await model.navigate(location())
    await model.choose(position())
    const pending = model.query("definition")
    await model.choose(position())
    assert.equal(querySignal.aborted, true)
    resolve({ locations: [location("/repo/stale.ts")], truncated: false })
    await pending
    assert.equal(model.document()!.path, "/repo/a.ts")
    assert.equal(model.results(), undefined)
  } finally { dispose() }
})

test("refresh retains displayed text, reports failures inline and permits retry", { skip: isServer }, async () => {
  let fail = false
  let reads = 0
  const { model, dispose } = modelRoot(client({ document: async (path) => {
    reads++
    if (fail) throw { message: "remote offline" }
    return document(path)
  } }))
  try {
    await model.navigate(location())
    const previous = model.document()
    const navigation = model.navigation()
    fail = true
    const refresh = model.refresh()
    assert.equal(model.document(), previous)
    await refresh
    assert.equal(model.error(), "remote offline")
    assert.equal(model.canQuery(), false)
    fail = false
    await model.refresh()
    assert.equal(model.error(), "")
    assert.equal(reads, 3)
    assert.equal(model.navigation(), navigation, "refresh must not request a jump away from the user's scroll position")
  } finally { dispose() }
})

test("unsupported files and mismatched source text never issue LSP queries", { skip: isServer }, async () => {
  let calls = 0
  const { model, dispose } = modelRoot(client({
    document: async (path) => ({ ...document(path), queryable: !path.endsWith(".json") }),
    lookup: async () => { calls++; return { locations: [], truncated: false } },
  }))
  try {
    await model.navigate(location("/repo/config.json"))
    await model.choose(position("/repo/config.json"))
    await model.query("definition")
    await model.navigate(location())
    await model.choose({ ...position(), expectedLine: "stale text" })
    await model.query("hover")
    assert.equal(calls, 0)
    assert.equal(model.target(), undefined)
  } finally { dispose() }
})

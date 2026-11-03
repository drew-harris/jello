import { strict as assert } from "node:assert"
import { test } from "node:test"
import { mkdir, mkdtemp, rm, writeFile, realpath, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createLanguageService, hoverText, normalizeLocations, readSource, setupIntelligence } from "./server"
import { Intelligence } from "./rpc"
import type { Plugin } from "@opencode/plugin"

test("normalizes locations and links, deduplicating targets and excluding non-file URIs", () => {
  const range = { start: { line: 2, character: 3 }, end: { line: 2, character: 9 } }
  const location = { uri: "file:///repo/a%20b.ts", range }
  assert.deepEqual(normalizeLocations([location, location, { targetUri: location.uri, targetRange: range, targetSelectionRange: range },
    { uri: "https://example.com/file", range }]), [{ path: "/repo/a b.ts", line: 2, character: 3, endLine: 2, endCharacter: 9 }])
  assert.deepEqual(normalizeLocations(null), [])
})

test("hover payloads normalize every LSP content shape without interpreting HTML", () => {
  assert.equal(hoverText(null), "")
  assert.equal(hoverText({ contents: "plain" }), "plain")
  assert.equal(hoverText({ contents: { kind: "markdown", value: "**value** <script>unsafe()</script>" } }), "**value** <script>unsafe()</script>")
  assert.equal(hoverText({ contents: [{ language: "typescript", value: "const value: number" }, "Docs"] }), "const value: number\n\nDocs")
  assert.equal(hoverText({ contents: "x".repeat(100_000) }).length, 64_000)
})

test("intelligence RPC schemas do not include host-unsupported regex validation", () => {
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return
    for (const [key, child] of Object.entries(value)) {
      assert.notEqual(key, "pattern")
      assert.notEqual(key, "patternProperties")
      visit(child)
    }
  }
  visit(Intelligence.methods)
})

test("restart replaces the workspace language server, clears source authorization, and leaves other workspaces alone", { timeout: 60_000 }, async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true })
  const fixture = await realpath(await mkdtemp(join(tmpdir(), "opencode", "jello-lsp-restart-")))
  const directories = [join(fixture, "first"), join(fixture, "second")]
  for (const directory of directories) {
    await mkdir(directory)
    await writeFile(join(directory, "main.ts"), "const value = 1\nconsole.log(value)\n")
  }
  type Handler = (input: unknown, context: { signal: AbortSignal }) => Promise<unknown>
  let handlers!: Record<string, Handler>
  const events: Array<{ name: string; data: unknown }> = []
  const ctx = { rpc: { register: async (_definition: unknown, implementation: Record<string, Handler>) => {
    handlers = implementation
    return { events: { emit: async (name: string, data: unknown) => { events.push({ name, data }) } }, dispose: async () => {} }
  } } } as unknown as Plugin.Context
  const cleanup = await setupIntelligence(ctx)
  const context = { signal: new AbortController().signal }
  const lookup = (directory: string) => handlers.lookup({ directory, path: "main.ts", line: 1, character: 12,
    expectedLine: "console.log(value)", kind: "definition" }, context)
  const source = (directory: string) => handlers.source({ directory, path: join(directory, "main.ts"), line: 0 }, context)
  try {
    await Promise.all(directories.map(lookup))
    await Promise.all(directories.map(source))
    const input = { directory: directories[0] }
    const results = await Promise.all([handlers.restart(input, context), handlers.restart(input, context)])
    assert.deepEqual(results, [{ restarted: true }, { restarted: true }])
    assert.deepEqual(events, [{ name: "restarted", data: { directory: directories[0], root: directories[0] } }])
    await assert.rejects(source(directories[0]), /expired/, "Restart must discard the previous authorized peek targets")
    await source(directories[1])
    await lookup(directories[0])
    await source(directories[0])
  } finally {
    cleanup()
    await rm(fixture, { recursive: true, force: true })
  }
})

test("real LSP peeks resolve definitions, references and changed files without permitting arbitrary source reads", { timeout: 60_000 }, async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true })
  const fixture = await realpath(await mkdtemp(join(tmpdir(), "opencode", "jello-peek-")))
  const root = join(fixture, "workspace")
  await mkdir(root)
  await writeFile(join(fixture, "outside.ts"), "export const secret = 42\n")
  const line = "export const answer = twice(21)"
  await writeFile(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ESNext", module: "ESNext" }, include: ["*.ts"] }))
  await writeFile(join(root, "lib.ts"), "export function twice(n: number) { return n * 2 }\n")
  await writeFile(join(root, "main.ts"), `import { twice } from './lib'\n${line}\nfunction unrelated(twice: number) { return twice + 1 }\n`)
  await writeFile(join(root, "other.ts"), "import { twice } from './lib'\nexport const other = twice(2)\n")
  const service = createLanguageService(root)
  try {
    const input = { path: "main.ts", line: 1, character: line.indexOf("twice"), expectedLine: line }
    const definitions = await service.lookup({ ...input, kind: "definition" })
    assert.equal(definitions.locations.length, 1)
    assert.equal(definitions.locations[0].path, join(root, "lib.ts"))
    assert.equal(definitions.locations[0].line, 0)
    assert.equal(definitions.sameFile, false)
    const source = await service.source(definitions.locations[0].path, 0)
    assert.match(source.lines[0], /function twice/)
    await assert.rejects(service.source(join(root, "tsconfig.json"), 0), /expired/)
    const references = await service.lookup({ ...input, kind: "references" })
    assert.ok(references.locations.some((item) => item.path === join(root, "other.ts") && item.line === 1))
    const highlights = await service.lookup({ ...input, kind: "documentHighlight" })
    assert.equal(highlights.locations.length, 2, "Include the import and use, but not the shadowed parameter")
    assert.ok(highlights.locations.every((item) => item.path === join(root, "main.ts") && item.line < 2))
    assert.ok(highlights.locations.some((item) => item.line === 1 && item.character === line.indexOf("twice")))
    await assert.rejects(service.lookup({ ...input, kind: "definition", expectedLine: "stale diff" }), /no longer matches/)
    await assert.rejects(service.lookup({ ...input, path: "../outside.ts", kind: "definition" }), /inside this workspace/)
    await assert.rejects(service.lookup({ ...input, path: "tsconfig.json", kind: "definition" }), /TypeScript and JavaScript/)
    // A previously opened file must reflect external working-copy edits too.
    await writeFile(join(root, "main.ts"), `import { twice } from './lib'\n${line}\nconsole.log(answer)\n`)
    const updated = await service.lookup({ path: "main.ts", line: 2, character: 12, expectedLine: "console.log(answer)", kind: "definition" })
    assert.equal(updated.locations[0].line, 1)
    assert.equal(updated.sameFile, true)
    const cancelled = new AbortController()
    cancelled.abort()
    await assert.rejects(service.lookup({ ...input, kind: "definition" }, cancelled.signal))
    await writeFile(join(root, "binary.ts"), Buffer.from([0, 1, 2]))
    await assert.rejects(readSource(join(root, "binary.ts")), /binary/)
    await writeFile(join(root, "large.ts"), Buffer.alloc(4 * 1024 * 1024 + 1, "a"))
    await assert.rejects(readSource(join(root, "large.ts")), /4 MiB/)
  } finally {
    service.stop()
    await rm(fixture, { recursive: true, force: true })
  }
})

test("full file views support type definitions, implementations, hover and authorized dependency navigation", { timeout: 60_000 }, async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true })
  const fixture = await realpath(await mkdtemp(join(tmpdir(), "opencode", "jello-file-view-")))
  const root = join(fixture, "workspace")
  await mkdir(root)
  const dependency = join(fixture, "dependency.ts")
  const secret = join(fixture, "secret.ts")
  await writeFile(dependency, "export const dependency = 42\nexport function external() { return dependency }\n")
  await writeFile(secret, "export const secret = 'not authorized'\n")
  await symlink(secret, join(root, "escape.ts"))
  await writeFile(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ESNext", module: "ESNext" }, include: ["*.ts"] }))
  await writeFile(join(root, "lib.ts"), "export interface Shape { size: number }\nexport class Square implements Shape { size = 2 }\nexport const square: Shape = new Square()\n")
  const lines = ["import { square, Shape } from './lib'", "export const size = square.size", "import { external } from '../dependency'", "external()",
    ...Array.from({ length: 120 }, (_, index) => `// unchanged line ${index}`), "console.log(size)"]
  const contents = lines.join("\n")
  await writeFile(join(root, "main.ts"), contents)
  const service = createLanguageService(root)
  try {
    const document = await service.document("main.ts")
    assert.equal(document.text, contents, "return the whole file, not a preview around the selected line")
    assert.equal(document.queryable, true)
    assert.equal((await service.document("tsconfig.json")).queryable, false)
    await assert.rejects(service.document(dependency), /workspace|authorized/)
    await assert.rejects(service.document("escape.ts"), /workspace|authorized/)
    const square = { path: "main.ts", line: 1, character: lines[1].indexOf("square"), expectedLine: lines[1] }
    const types = await service.lookup({ ...square, kind: "typeDefinition" })
    assert.ok(types.locations.some((location) => location.path === join(root, "lib.ts") && location.line === 0))
    const implementations = await service.lookup({ path: "main.ts", line: 0, character: lines[0].indexOf("Shape"), expectedLine: lines[0], kind: "implementation" })
    assert.ok(implementations.locations.some((location) => location.path === join(root, "lib.ts") && location.line === 1))
    assert.match((await service.hover(square)).text, /Shape/)
    await assert.rejects(service.hover({ ...square, expectedLine: "stale source" }), /no longer matches/)
    await service.lookup({ path: "main.ts", line: 3, character: 1, expectedLine: lines[3], kind: "definition" })
    const outside = await service.document(dependency)
    assert.equal(outside.path, dependency)
    assert.match(outside.text, /export const dependency/)
    const outsideLine = "export function external() { return dependency }"
    const value = await service.hover({ path: dependency, line: 1, character: outsideLine.indexOf("dependency"), expectedLine: outsideLine })
    assert.match(value.text, /dependency/)
    await assert.rejects(service.document(secret), /workspace|authorized/)
    const cancelled = new AbortController()
    cancelled.abort()
    await assert.rejects(service.document("main.ts", cancelled.signal))
  } finally {
    service.stop()
    await rm(fixture, { recursive: true, force: true })
  }
})

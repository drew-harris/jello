import { spawn } from "node:child_process"
import { open, realpath } from "node:fs/promises"
import { createRequire } from "node:module"
import { isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { CancellationTokenSource, createMessageConnection, StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node"
import type { Plugin } from "@opencode/plugin"
import { Intelligence, type LookupKind, type PeekLocation, type PeekResult } from "./rpc.ts"

const require = createRequire(import.meta.url)
const limit = 500
const maxFileSize = 4 * 1024 * 1024
const inside = (root: string, path: string) => {
  const child = relative(root, path)
  return child !== ".." && !child.startsWith("../") && !isAbsolute(child)
}

export async function readSource(path: string) {
  const file = await open(path, "r")
  try {
    const info = await file.stat()
    if (!info.isFile() || info.size > maxFileSize) throw new Error("Peek supports text files up to 4 MiB.")
    const buffer = Buffer.alloc(info.size + 1)
    let bytesRead = 0
    while (bytesRead < buffer.length) {
      const read = await file.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead)
      if (!read.bytesRead) break
      bytesRead += read.bytesRead
    }
    if (bytesRead > info.size) throw new Error("File changed while loading the peek. Try again.")
    const text = buffer.subarray(0, bytesRead).toString("utf8")
    if (text.includes("\0")) throw new Error("Cannot peek a binary file.")
    return text
  } finally { await file.close() }
}

type Position = { line: number; character: number }
type Range = { start: Position; end: Position }
type Location = { uri: string; range: Range } | { targetUri: string; targetRange: Range; targetSelectionRange?: Range }

export function normalizeLocations(value: Location | Location[] | null): PeekLocation[] {
  const seen = new Set<string>()
  const result: PeekLocation[] = []
  for (const item of value == null ? [] : Array.isArray(value) ? value : [value]) {
    const uri = "uri" in item ? item.uri : item.targetUri
    if (!uri.startsWith("file:")) continue
    const range = "range" in item ? item.range : item.targetSelectionRange ?? item.targetRange
    const location = { path: fileURLToPath(uri), line: range.start.line, character: range.start.character,
      endLine: range.end.line, endCharacter: range.end.character }
    const key = JSON.stringify(location)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(location)
  }
  return result
}

export function createLanguageService(root: string) {
  // Resolve bundled scripts; only Node itself needs to be on PATH. OpenCode can
  // be a standalone executable, so process.execPath is not a JS runtime here.
  const child = spawn("node", [require.resolve("typescript-language-server/lib/cli.mjs"), "--stdio"], {
    cwd: root, stdio: ["pipe", "pipe", "pipe"],
  })
  const connection = createMessageConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin))
  let stopped = false
  let stderr = ""
  child.stderr.on("data", (data) => { stderr = (stderr + data.toString()).slice(-4000) })
  const stop = () => {
    if (stopped) return
    stopped = true
    connection.dispose()
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      // This server handles SIGINT by shutting down its tsserver child as well.
      child.kill("SIGINT")
      const force = setTimeout(() => child.kill("SIGKILL"), 2000)
      force.unref()
      child.once("exit", () => clearTimeout(force))
    }
  }
  child.on("error", (error) => { stderr = error.message; stop() })
  child.on("exit", stop)
  connection.onClose(stop)
  connection.onRequest("workspace/configuration", (params: { items: unknown[] }) => params.items.map(() => ({})))
  connection.listen()
  const request = async <T>(method: string, params: unknown, signal?: AbortSignal): Promise<T> => {
    if (stopped) throw new Error(`TypeScript language server stopped. ${stderr}`)
    signal?.throwIfAborted()
    const cancellation = new CancellationTokenSource()
    let rejectAbort: ((reason: unknown) => void) | undefined
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject })
    const abort = () => { cancellation.cancel(); rejectAbort?.(signal?.reason ?? new Error("Lookup cancelled")) }
    signal?.addEventListener("abort", abort, { once: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        connection.sendRequest<T>(method, params, cancellation.token),
        aborted,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { cancellation.cancel(); reject(new Error("Language lookup timed out. The project may still be loading; try again.")) }, 45_000)
        }),
      ])
    } catch (error) {
      if (stopped) throw new Error(`Could not run the TypeScript language server. Ensure Node.js 22.22.2+ is on the OpenCode server's PATH. ${stderr}`)
      throw error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      cancellation.dispose()
    }
  }
  const ready = request("initialize", {
    processId: process.pid, rootUri: pathToFileURL(root).href,
    capabilities: { general: { positionEncodings: ["utf-16"] }, textDocument: { definition: { linkSupport: true } } },
    // A syntax-only server can return a local import alias before semantic
    // loading finishes. Peeks must always use the semantic project service.
    initializationOptions: { disableAutomaticTypingAcquisition: true, tsserver: { fallbackPath: require.resolve("typescript/lib/tsserver.js"), useSyntaxServer: "never" },
      preferences: { includePackageJsonAutoImports: "off" } },
  }).then(() => connection.sendNotification("initialized", {})).catch((error) => { stop(); throw error })
  // Attach a handler immediately; initialization can fail before the first query.
  void ready.catch(() => {})
  const documents = new Map<string, { text: string; version: number }>()
  const allowed = new Set<string>()
  let queue = Promise.resolve()
  let touched = Date.now()
  // Serialize document synchronization + requests to avoid racing concurrent panels.
  const lookup = (input: { path: string; line: number; character: number; expectedLine: string; kind: LookupKind }, signal?: AbortSignal) => {
    touched = Date.now()
    const work = queue.then(async (): Promise<PeekResult> => {
      await ready
      signal?.throwIfAborted()
      const path = await realpath(resolve(root, input.path))
      if (!inside(root, path)) throw new Error("The source file must be inside this workspace.")
      if (!/\.[cm]?[jt]sx?$/i.test(path)) throw new Error("Code peeks currently support TypeScript and JavaScript files.")
      const text = await readSource(path)
      const lines = text.split(/\r?\n/)
      if (lines[input.line] !== input.expectedLine.replace(/\r?\n$/, "") || input.character >= (lines[input.line]?.length ?? 0)) {
        throw new Error("This diff no longer matches the working-copy file. Refresh the diff and try again.")
      }
      // Refresh other opened files too: external edits must not leave tsserver's
      // in-memory buffers stale. The open-document set is bounded below.
      for (const [uri, previous] of documents) {
        let contents: string
        try { contents = await readSource(fileURLToPath(uri)) } catch {
          await connection.sendNotification("textDocument/didClose", { textDocument: { uri } })
          documents.delete(uri)
          continue
        }
        if (contents === previous.text) continue
        previous.text = contents
        previous.version++
        await connection.sendNotification("textDocument/didChange", { textDocument: { uri, version: previous.version }, contentChanges: [{ text: contents }] })
      }
      const uri = pathToFileURL(path).href
      if (!documents.has(uri)) {
        if (documents.size >= 16) {
          const oldest = documents.keys().next().value!
          await connection.sendNotification("textDocument/didClose", { textDocument: { uri: oldest } })
          documents.delete(oldest)
        }
        documents.set(uri, { text, version: 1 })
        const languageId = /\.tsx$/i.test(path) ? "typescriptreact" : /\.jsx$/i.test(path) ? "javascriptreact" : /\.[cm]?ts$/i.test(path) ? "typescript" : "javascript"
        await connection.sendNotification("textDocument/didOpen", { textDocument: { uri, languageId, version: 1, text } })
      }
      const value = await request<Location | Location[] | { range: Range }[] | null>(`textDocument/${input.kind}`, {
        textDocument: { uri }, position: { line: input.line, character: input.character },
        ...(input.kind === "references" ? { context: { includeDeclaration: false } } : {}),
      }, signal)
      const all = normalizeLocations(input.kind === "documentHighlight"
        ? ((value ?? []) as { range: Range }[]).map((highlight) => ({ uri, range: highlight.range }))
        : value as Location | Location[] | null)
      const locations = all.slice(0, limit)
      // Only server-returned targets can be read through source(), including
      // dependency declarations outside the workspace. Never expose arbitrary fs reads.
      for (const location of locations) allowed.add(location.path)
      if (allowed.size > 10000) { allowed.clear(); for (const location of locations) allowed.add(location.path) }
      return { locations, truncated: all.length > limit, sameFile: all.length > 0 && all.every((location) => location.path === path) }
    })
    queue = work.then(() => {}, () => {})
    return work
  }
  return { lookup, stop, get stopped() { return stopped }, get touched() { return touched },
    async source(path: string, line: number) {
      touched = Date.now()
      if (!allowed.has(path)) throw new Error("Peek target expired. Run the lookup again.")
      const lines = (await readSource(path)).split(/\r?\n/)
      const startLine = Math.max(0, Math.min(line, lines.length - 1) - 8)
      return { startLine, lines: lines.slice(startLine, Math.min(lines.length, line + 24)) }
    },
  }
}

export async function setupIntelligence(ctx: Plugin.Context) {
  const services = new Map<string, ReturnType<typeof createLanguageService>>()
  const service = async (directory: string) => {
    const root = await realpath(directory)
    let value = services.get(root)
    if (!value || value.stopped) {
      if (services.size >= 4) {
        const oldest = [...services].sort((a, b) => a[1].touched - b[1].touched)[0]
        oldest[1].stop()
        services.delete(oldest[0])
      }
      value = createLanguageService(root)
      services.set(root, value)
    }
    return value
  }
  const registration = await ctx.rpc.register(Intelligence, {
    lookup: async (input, context) => {
      const value = input as { directory: string; path: string; line: number; character: number; expectedLine: string; kind: LookupKind }
      return (await service(value.directory)).lookup(value, context.signal)
    },
    source: async (input) => {
      const value = input as { directory: string; path: string; line: number }
      const existing = services.get(await realpath(value.directory))
      if (!existing || existing.stopped) throw new Error("Peek target expired. Run the lookup again.")
      return existing.source(value.path, value.line)
    },
  })
  const timer = setInterval(() => {
    for (const [root, value] of services) {
      if (Date.now() - value.touched < 10 * 60_000) continue
      value.stop()
      services.delete(root)
    }
  }, 60_000)
  timer.unref()
  return () => { clearInterval(timer); for (const value of services.values()) value.stop(); void registration.dispose() }
}

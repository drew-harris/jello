import { batch, createMemo, createSignal, onCleanup } from "solid-js"
import { errorMessage } from "../../shared/errors"
import type { LanguageClient } from "./client"
import type { PeekLocation, PeekResult, SourceDocument, SymbolPosition } from "./rpc"
import { navigationQueries, type FileQuery } from "./queries"
import type { FileChangeProvider, FileChanges } from "./file-changes"

export interface FileResults extends PeekResult { label: string }
interface Visit { location: PeekLocation; results?: FileResults }

// Read-only source navigation, independent of a diff, a peek pane or the host.
// Documents are fetched once per visit/cache miss, never on a polling timer.
export function createFileViewModel(client: LanguageClient, changeProvider?: FileChangeProvider) {
  const cache = new Map<string, SourceDocument>()
  const changeCache = new WeakMap<SourceDocument, FileChanges>()
  const [changes, setChanges] = createSignal<FileChanges>()
  const [changesLoading, setChangesLoading] = createSignal(false)
  const [changesError, setChangesError] = createSignal("")
  let changesController: AbortController | undefined
  const loadChanges = async (source: SourceDocument) => {
    if (!changeProvider) return
    const cached = changeCache.get(source)
    if (cached) { setChanges(cached); return }
    const controller = changesController = new AbortController()
    setChangesLoading(true)
    try {
      const value = await changeProvider(source, controller.signal)
      if (controller.signal.aborted) return
      changeCache.set(source, value)
      setChanges(value)
    } catch (cause) {
      if (!controller.signal.aborted) setChangesError(errorMessage(cause))
    } finally { if (!controller.signal.aborted) setChangesLoading(false) }
  }
  const clearChanges = () => {
    changesController?.abort()
    batch(() => { setChanges(undefined); setChangesLoading(false); setChangesError("") })
  }
  const [document, setDocument] = createSignal<SourceDocument>()
  const [location, setLocation] = createSignal<PeekLocation>()
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal("")
  const [target, setTarget] = createSignal<SymbolPosition>()
  const [occurrences, setOccurrences] = createSignal<PeekLocation[]>([])
  const [queryLoading, setQueryLoading] = createSignal(false)
  const [queryError, setQueryError] = createSignal("")
  const [highlightLoading, setHighlightLoading] = createSignal(false)
  const [highlightError, setHighlightError] = createSignal("")
  const [hover, setHover] = createSignal<string>()
  const [results, setResults] = createSignal<FileResults>()
  const [history, setHistory] = createSignal<Visit[]>([])
  const [cursor, setCursor] = createSignal(-1)
  const [navigation, setNavigation] = createSignal(0)
  const lines = createMemo(() => document()?.text.split(/\r?\n/) ?? [])
  let documentController: AbortController | undefined
  let queryController: AbortController | undefined
  let highlightController: AbortController | undefined

  const clearSymbol = () => {
    queryController?.abort()
    highlightController?.abort()
    batch(() => { setTarget(undefined); setOccurrences([]); setHover(undefined); setQueryError(""); setHighlightError(""); setQueryLoading(false); setHighlightLoading(false) })
  }
  const canQuery = () => !!document()?.queryable && !loading() && !error()
  const navigate = async (destination: PeekLocation, record = true, force = false) => {
    documentController?.abort()
    clearChanges()
    clearSymbol()
    const controller = documentController = new AbortController()
    const snapshot = { ...destination }
    if (record) {
      const visits = [...history().slice(0, cursor() + 1), { location: snapshot, results: results() }].slice(-50)
      batch(() => { setHistory(visits); setCursor(visits.length - 1) })
    }
    if (force) cache.delete(snapshot.path)
    const cached = cache.get(snapshot.path)
    batch(() => {
      setLocation(snapshot)
      setError("")
      setDocument(cached ?? (force ? document() : undefined))
      setLoading(!cached)
    })
    try {
      const loaded = cached ?? await client.document(snapshot.path, controller.signal)
      if (controller.signal.aborted) return
      cache.delete(snapshot.path)
      cache.set(snapshot.path, loaded)
      while (cache.size > 8) cache.delete(cache.keys().next().value!)
      batch(() => {
        setDocument(loaded)
        if (!force) setNavigation((value) => value + 1)
      })
      void loadChanges(loaded)
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause))
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }
  const selectResult = (index: number) => {
    const item = results()?.locations[index]
    if (item) return navigate(item)
  }
  const choose = async (position: SymbolPosition) => {
    clearSymbol()
    if (!canQuery() || position.path !== document()?.path || lines()[position.line] !== position.expectedLine) return
    setTarget(position)
    setOccurrences([{ path: position.path, line: position.line, character: position.character,
      endLine: position.line, endCharacter: position.character + position.text.length }])
    const controller = highlightController = new AbortController()
    setHighlightLoading(true)
    try {
      const value = await client.lookup(position, "documentHighlight", controller.signal)
      if (!controller.signal.aborted) setOccurrences(value.locations)
    } catch (cause) {
      if (!controller.signal.aborted) setHighlightError(errorMessage(cause))
    } finally { if (!controller.signal.aborted) setHighlightLoading(false) }
  }
  const query = async (kind: FileQuery) => {
    const position = target()
    if (!position || !canQuery()) return
    queryController?.abort()
    const controller = queryController = new AbortController()
    batch(() => { setQueryLoading(true); setQueryError(""); setHover(undefined) })
    try {
      if (kind === "hover") {
        const value = await client.hover(position, controller.signal)
        if (!controller.signal.aborted) setHover(value.text || "No hover information available.")
      } else {
        const value = await client.lookup(position, kind, controller.signal)
        if (controller.signal.aborted) return
        setResults({ ...value, label: `${navigationQueries.find((query) => query.kind === kind)!.label}: ${position.text}` })
        if (value.locations.length) await selectResult(0)
      }
    } catch (cause) {
      if (!controller.signal.aborted) setQueryError(errorMessage(cause))
    } finally { if (!controller.signal.aborted) setQueryLoading(false) }
  }
  const travel = (step: number) => {
    const index = cursor() + step
    const visit = history()[index]
    if (!visit) return
    batch(() => { setCursor(index); setResults(visit.results) })
    return navigate(visit.location, false)
  }
  // Return false only when the containing peek may handle Escape itself.
  const escape = () => {
    if (cursor() > 0) { void travel(-1); return true }
    if (hover() !== undefined) { setHover(undefined); return true }
    if (target()) { clearSymbol(); return true }
    return false
  }
  const reset = () => {
    documentController?.abort()
    clearChanges()
    clearSymbol()
    cache.clear()
    batch(() => { setDocument(undefined); setLocation(undefined); setHistory([]); setCursor(-1); setResults(undefined); setLoading(false); setError("") })
  }
  onCleanup(reset)
  return {
    changes, changesLoading, changesError, hasChanges: !!changeProvider,
    document, location, loading, error, target, occurrences, queryLoading, queryError, highlightLoading, highlightError, hover, results, navigation,
    canQuery, navigate, choose, query, selectResult, clearSymbol, reset, escape,
    canBack: () => cursor() > 0,
    canForward: () => cursor() + 1 < history().length,
    back: () => travel(-1), forward: () => travel(1),
    refresh: () => { const current = location(); if (current) return navigate(current, false, true) },
    dismissHover: () => setHover(undefined),
    seed(value: FileResults) {
      reset()
      setResults(value)
      if (value.locations[0]) return navigate(value.locations[0])
    },
  }
}

export type FileViewModel = ReturnType<typeof createFileViewModel>

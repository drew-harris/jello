import type { Comment, SessionScreen } from "@opencode/plugin/gui"
import type { DiffLineAnnotation, FileDiffMetadata, SelectedLineRange } from "@pierre/diffs"
import { createEffect, createMemo, createSignal, onCleanup, Show, untrack, type Accessor } from "solid-js"
import { render } from "solid-js/web"
import { diffCommentPreview, removeDiffComment, saveDiffComment, updateDiffComment } from "./annotations"

type Draft = { id: string; file: string; selection: SelectedLineRange; preview?: string }
type Metadata = { kind: "saved"; value: Comment } | { kind: "draft"; value: Draft }
export type DiffAnnotation = DiffLineAnnotation<Metadata>
const empty: DiffAnnotation[] = []

export function createDiffComments(screen: Accessor<SessionScreen>, clearSelection: () => void) {
  const [draft, setDraft] = createSignal<Draft>()
  const nodes = new Map<string, { host: HTMLElement; dispose(): void; set(meta: Metadata): void }>()
  const cached = new WeakMap<Comment | Draft, DiffAnnotation>()
  const annotation = (meta: Metadata): DiffAnnotation => {
    const previous = cached.get(meta.value)
    if (previous) return previous
    const range = meta.value.selection
    const result = { side: range.endSide ?? range.side ?? "additions", lineNumber: Math.max(range.start, range.end), metadata: meta } as DiffAnnotation
    cached.set(meta.value, result)
    return result
  }
  // Preserve each unchanged file's annotation array. CodeView need only update
  // the file whose comments changed, not every file in a large remote diff.
  const byFile = createMemo((previous: Map<string, DiffAnnotation[]>) => {
    const next = new Map<string, DiffAnnotation[]>()
    const add = (meta: Metadata) => {
      const list = next.get(meta.value.file) ?? []
      list.push(annotation(meta))
      next.set(meta.value.file, list)
    }
    for (const value of screen().comment.list()) add({ kind: "saved", value })
    const pending = draft()
    if (pending) add({ kind: "draft", value: pending })
    for (const [file, list] of next) {
      const before = previous.get(file)
      if (before?.length === list.length && before.every((entry, index) => entry === list[index])) next.set(file, before)
    }
    return next
  }, new Map<string, DiffAnnotation[]>())
  createEffect(() => {
    const ids = new Set([...byFile().values()].flat().map((entry) => entry.metadata.value.id))
    for (const [id, node] of nodes) {
      if (ids.has(id)) continue
      node.dispose()
      nodes.delete(id)
    }
  })
  onCleanup(() => { for (const node of nodes.values()) node.dispose(); nodes.clear() })
  const cancel = () => {
    setDraft(undefined)
    clearSelection()
  }
  createEffect(() => {
    const pending = draft()
    if (!pending) return
    const dismiss = (event: PointerEvent) => {
      const host = nodes.get(pending.id)?.host
      // Slotted annotations cross Pierre's shadow boundary. Use the composed
      // path so clicks in the editor or its buttons never dismiss the draft.
      if (host && event.composedPath().includes(host)) return
      cancel()
    }
    document.addEventListener("pointerdown", dismiss, true)
    onCleanup(() => document.removeEventListener("pointerdown", dismiss, true))
  })
  return {
    annotations: (file: FileDiffMetadata) => byFile().get(file.name) ?? empty,
    open(file: FileDiffMetadata, range: SelectedLineRange | null) {
      if (!range) { cancel(); return }
      if (!screen().composer.quotable()) return
      setDraft({ id: `draft:${crypto.randomUUID()}`, file: file.name, selection: { ...range }, preview: diffCommentPreview(file, range) })
    },
    render(entry: { metadata: Metadata }) {
      const meta = entry.metadata
      const previous = nodes.get(meta.value.id)
      if (previous) { previous.set(meta); return previous.host }
      const host = document.createElement("div")
      host.setAttribute("data-prevent-autofocus", "")
      const [current, setCurrent] = createSignal(meta)
      const dispose = render(() => <CommentCard meta={current} screen={screen} cancel={cancel} />, host)
      nodes.set(meta.value.id, { host, dispose, set: setCurrent })
      return host
    },
  }
}

export type DiffComments = ReturnType<typeof createDiffComments>

function CommentCard(props: { meta: Accessor<Metadata>; screen: Accessor<SessionScreen>; cancel(): void }) {
  const body = () => {
    const meta = props.meta()
    return meta.kind === "saved" ? meta.value.comment : ""
  }
  const [editing, setEditing] = createSignal(props.meta().kind === "draft")
  const [text, setText] = createSignal(body())
  let textarea: HTMLTextAreaElement | undefined
  const label = () => {
    const range = props.meta().value.selection
    const start = Math.min(range.start, range.end)
    const end = Math.max(range.start, range.end)
    return start === end ? `Line ${start}` : `Lines ${start}–${end}`
  }
  const edit = () => {
    const meta = props.meta()
    if (meta.kind === "saved") setText(meta.value.comment)
    setEditing(true)
  }
  const cancel = () => { if (props.meta().kind === "draft") props.cancel(); else setEditing(false) }
  const save = () => {
    const meta = props.meta()
    if (!text().trim()) return
    if (meta.kind === "draft") {
      if (saveDiffComment(props.screen(), { ...meta.value, comment: text() })) props.cancel()
    } else {
      updateDiffComment(props.screen(), meta.value.id, text())
      setEditing(false)
    }
  }
  createEffect(() => {
    if (!editing()) return
    const frame = requestAnimationFrame(() => textarea?.focus({ preventScroll: true }))
    onCleanup(() => cancelAnimationFrame(frame))
  })
  createEffect(() => {
    const focus = props.screen().comment.focus.current()
    if (focus?.id !== props.meta().value.id) return
    untrack(() => {
      props.screen().comment.active.set(focus)
      props.screen().comment.focus.set(null)
    })
  })
  return <div class="jello-diff-comment" onKeyDown={(event) => event.stopPropagation()}>
    <Show when={editing()} fallback={<>
      <button type="button" class="jello-diff-comment-body" onClick={edit}>{body()}</button>
      <div class="jello-diff-comment-actions"><span>{label()}</span>
        <button type="button" onClick={edit}>Edit</button>
        <button type="button" onClick={() => removeDiffComment(props.screen(), props.meta().value.id)}>Delete</button>
      </div>
    </>}>
      <form onSubmit={(event) => { event.preventDefault(); save() }}>
        <textarea ref={textarea} aria-label="Comment" placeholder="Leave a comment…" rows={3} value={text()}
          onInput={(event) => setText(event.currentTarget.value)} onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); cancel() }
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); save() }
          }} />
        <div class="jello-diff-comment-actions"><span>{label()}</span>
          <button type="button" onClick={cancel}>Cancel</button>
          <button type="submit" disabled={!text().trim()}>{props.meta().kind === "draft" ? "Comment" : "Save"}</button>
        </div>
      </form>
    </Show>
  </div>
}

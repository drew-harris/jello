import { getFiletypeFromFileName, getSharedHighlighter, type ThemedToken } from "@pierre/diffs"
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import type { PeekLocation, PeekSource } from "./rpc"
import { previewSegments } from "./preview"

export function PeekCode(props: { source: PeekSource; location: PeekLocation }) {
  const ctx = usePlugin()
  const [tokens, setTokens] = createSignal<ThemedToken[][]>()
  createEffect(() => {
    const contents = props.source.lines.join("\n")
    const lang = getFiletypeFromFileName(props.location.path)
    const theme = `jello-jj-${ctx.appearance.mode()}` as const
    let cancelled = false
    setTokens(undefined)
    onCleanup(() => { cancelled = true })
    void getSharedHighlighter({ themes: [theme], langs: [lang] }).then((highlighter) => {
      if (cancelled) return
      const result = highlighter.codeToTokens(contents, { lang, theme, tokenizeMaxLineLength: 10_000, tokenizeTimeLimit: 50 })
      if (!cancelled) setTokens(result.tokens)
    }).catch(() => { /* Keep the plain-text preview usable if a grammar fails. */ })
  })
  return <For each={props.source.lines}>{(line, index) => {
    const number = () => props.source.startLine + index()
    const highlighted = () => number() >= props.location.line && number() <= props.location.endLine
    const segments = () => previewSegments(line, tokens()?.[index()],
      highlighted() ? number() === props.location.line ? props.location.character : 0 : -1,
      highlighted() ? number() === props.location.endLine ? props.location.endCharacter : line.length : -1)
    return <div class="jello-jj-peek-line" classList={{ "is-target": highlighted() }}>
      <span class="jello-jj-peek-number" aria-hidden="true">{number() + 1}</span>
      <code><For each={segments()}>{(segment) => <span style={{ color: segment.color,
        "font-style": (segment.fontStyle ?? 0) & 1 ? "italic" : undefined,
        "font-weight": (segment.fontStyle ?? 0) & 2 ? "bold" : undefined,
        "text-decoration": (segment.fontStyle ?? 0) & 4 ? "underline" : undefined }}>
        <Show when={segment.highlighted} fallback={segment.text}><mark>{segment.text}</mark></Show>
      </span>}</For></code>
    </div>
  }}</For>
}

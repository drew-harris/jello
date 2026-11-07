import { CodeView, type FileDiffContentsLoader, type FileDiffMetadata } from "@pierre/diffs"
import { createEffect, createSignal, on, onCleanup, onMount } from "solid-js"
import { usePlugin, type SessionScreen } from "@opencode/plugin/gui"
import { diffThemeCSS } from "./theme"
import { createDiffStack, stackFileIndex } from "./stack"
import { errorMessage } from "../../../shared/errors"
import { normalizeDiffFontSize, type definition } from "../../../gui/definition"
import { createDiffComments, type DiffAnnotation } from "./comments"
import type { CodePeek } from "./intelligence/peek"
import { createOccurrenceHighlights } from "../../intelligence/highlights"
import { hasDefinitionLine, nextDefinitionFrame } from "./intelligence/jump"
import { openFileClick } from "./file-open"
import { adjacentHunk, hunkLine, type RegisterHunkNavigator } from "./hunks"

export function MultiFileDiff(props: {
  files: FileDiffMetadata[]
  layout: "unified" | "split"
  wrap: boolean
  selected: number
  navigation: number
  select(index: number): void
  screen: SessionScreen
  peek: CodePeek
  loadDiffFiles: FileDiffContentsLoader
  registerHunkNavigator: RegisterHunkNavigator
}) {
  const ctx = usePlugin<typeof definition>()
  let container!: HTMLDivElement
  const viewer = new CodeView<DiffAnnotation["metadata"]>()
  const items = createDiffStack<DiffAnnotation["metadata"]>()
  const comments = createDiffComments(() => props.screen, () => viewer.setSelectedLines(null))
  const occurrences = createOccurrenceHighlights(props.peek)
  const [expanded, setExpanded] = createSignal(false)
  let scrollTop = 0
  let destination: { id: string; hunk: number } | undefined
  const resetDestination = () => { destination = undefined }
  createEffect(on([() => props.files, () => props.layout, () => props.wrap, () => props.navigation, expanded], resetDestination))
  onCleanup(props.registerHunkNavigator((direction, smooth) => {
    const rendered = new Map(viewer.getRenderedItems().map((item) => [item.id, item]))
    const targets = props.files.flatMap((file) => {
      const top = viewer.getTopForItem(file.name)
      if (top === undefined) return []
      const item = rendered.get(file.name)
      const header = item?.element.shadowRoot?.querySelector<HTMLElement>("[data-diffs-header]")?.getBoundingClientRect().height ?? 0
      return file.hunks.map((hunk, index) => {
        const line = hunkLine(hunk)
        const position = item?.type === "diff" ? item.instance.getLinePosition(line.lineNumber, line.side) : undefined
        return { id: file.name, hunk: index, ...line, top: top + (position?.top ?? 0) - header }
      })
    })
    const previous = destination ? targets.findIndex((target) => target.id === destination!.id && target.hunk === destination!.hunk) : -1
    const target = previous >= 0 ? targets[previous + direction] : adjacentHunk(targets, scrollTop, direction)
    if (!target) return
    destination = target
    viewer.scrollTo({ type: "line", id: target.id, lineNumber: target.lineNumber, side: target.side,
      align: "start", behavior: smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant" })
  }))
  onCleanup(props.peek.registerDefinitionJump(async (location, signal) => {
    const file = props.files.find((file) => file.name === location.path)
    if (!file || !hasDefinitionLine(file, location.line)) return false
    setExpanded(true)
    await nextDefinitionFrame()
    if (signal.aborted || !container.isConnected) return false
    viewer.scrollTo({ type: "line", id: file.name, lineNumber: location.line + 1, side: "additions", align: "center", behavior: "instant" })
    return true
  }))
  const fontSize = () => normalizeDiffFontSize(ctx.stores.jjDiff.value.fontSize)
  const lineHeight = () => fontSize() + 10
  const initialFile = props.files[props.selected]?.name
  const copyPath = async (path: string) => {
    try {
      await ctx.system.copy(path)
      ctx.toast.show({ title: "Copied file path to clipboard", variant: "success", duration: 2000 })
    } catch (error) {
      ctx.toast.show({ title: "Could not copy file path", description: errorMessage(error), variant: "error" })
    }
  }
  onMount(() => {
    viewer.setup(container)
    const unsubscribe = viewer.subscribeToScroll((top) => {
      scrollTop = top
      const files = props.files
      const index = stackFileIndex(files.length, (index) => viewer.getTopForItem(files[index].name) ?? Infinity, scrollTop)
      if (index >= 0) props.select(index)
    })
    container.addEventListener("wheel", resetDestination, { passive: true })
    container.addEventListener("pointerdown", resetDestination)
    // Other keyboard scrolling should navigate relative to the new viewport.
    const panel = container.closest(".jello-jj-diff")
    const keydown = (event: Event) => {
      if (event instanceof KeyboardEvent && !["[", "]", "{", "}"].includes(event.key)) resetDestination()
    }
    panel?.addEventListener("keydown", keydown, true)
    onCleanup(() => {
      container.removeEventListener("wheel", resetDestination)
      container.removeEventListener("pointerdown", resetDestination)
      panel?.removeEventListener("keydown", keydown, true)
    })
    onCleanup(unsubscribe)
  })
  createEffect(() => {
    viewer.setOptions({
      diffStyle: props.layout,
      expandUnchanged: expanded(),
      loadDiffFiles: props.loadDiffFiles,
      theme: { light: "jello-jj-light", dark: "jello-jj-dark" },
      themeType: ctx.appearance.mode(),
      overflow: props.wrap ? "wrap" : "scroll",
      diffIndicators: "bars",
      lineDiffType: "word-alt",
      hunkSeparators: "line-info-basic",
      stickyHeaders: true,
      enableLineSelection: true,
      enableGutterUtility: false,
      onLineSelectionEnd: (range, context) => {
        if (context.item.type === "diff") comments.open(context.item.fileDiff, range)
      },
      renderAnnotation: comments.render,
      onTokenClick: (token, event, context) => {
        if (context.item.type === "diff" && "side" in token) props.peek.click(context.item.fileDiff.name, token, event)
      },
      itemMetrics: { lineHeight: lineHeight(), hunkSeparatorHeight: 24, spacing: 0 },
      layout: { paddingTop: 0, paddingBottom: 16, gap: 12 },
      unsafeCSS: `${diffThemeCSS(ctx.appearance.mode() === "dark")}\n${occurrences.css}
        [data-diffs-header=default] {
          padding: 10px 16px;
          background-color: ${ctx.appearance.mode() === "dark" ? "#232323" : "#f3f3f3"};
        }
        [data-header-content] { gap: 12px; }
        [data-header-content] [role=button] { cursor: pointer; }
        [data-header-content] [role=button]:hover { text-decoration: underline; }
        [data-header-content] [role=button]:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
        [data-header-content] [data-title], [data-header-content] [data-prev-name] {
          font-family: var(--diffs-font-family);
          letter-spacing: 0.025em;
          line-height: 1.6;
        }`,
      onPostRender: (node, _instance, phase, context) => {
        if (context.item.type === "diff") {
          const path = context.item.fileDiff.name
          occurrences.rendered(node, path, phase)
          node.oncontextmenu = phase === "unmount" ? null : (event) => props.peek.contextmenu(path, event)
        }
        if (phase === "unmount") return
        const root = node.shadowRoot ?? node
        for (const title of root.querySelectorAll<HTMLElement>("[data-header-content] [data-title], [data-header-content] [data-prev-name]")) {
          const path = title.textContent ?? ""
          title.setAttribute("role", "button")
          title.tabIndex = 0
          title.title = `Copy file path: ${path} · Cmd/Ctrl-click to open file`
          title.setAttribute("aria-label", `Copy file path: ${path}; Cmd/Ctrl-click to open file`)
          title.onclick = (event) => {
            if (context.item.type === "diff" && openFileClick(event, context.item.fileDiff.name, props.peek.openFile)) return
            void copyPath(path)
          }
          title.onkeydown = (event) => {
            if (event.key !== "Enter" && event.key !== " ") return
            event.preventDefault()
            event.stopPropagation()
            if ((event.metaKey || event.ctrlKey) && context.item.type === "diff") props.peek.openFile(context.item.fileDiff.name)
            else void copyPath(path)
          }
        }
      },
      renderHeaderMetadata: (file) => {
        if (!("hunks" in file)) return
        if (!file.hunks.length) return "No text hunks (binary, rename, empty file, or mode-only change)"
        return `+${file.hunks.reduce((sum, hunk) => sum + hunk.additionLines, 0)} −${file.hunks.reduce((sum, hunk) => sum + hunk.deletionLines, 0)}`
      },
    })
  })
  createEffect(() => viewer.setItems(items(props.files, comments.annotations)))
  // Scroll-driven selection only highlights the tree. Explicit file navigation
  // increments this counter, so scrolling never jumps back to a file header.
  createEffect(on(() => props.navigation, (_request, previous) => {
    const id = previous === undefined ? initialFile : props.files[props.selected]?.name
    if (id) viewer.scrollTo({ type: "item", id, align: "start", behavior: "instant" })
  }))
  onCleanup(() => viewer.cleanUp())
  return <div ref={container} class="jello-jj-diff-content jello-jj-diff-multi" aria-label="All changed file diffs"
    style={{ "--diffs-font-family": ctx.appearance.font("mono"), "--diffs-font-size": `${fontSize()}px`,
      "--diffs-line-height": `${lineHeight()}px` }} />
}

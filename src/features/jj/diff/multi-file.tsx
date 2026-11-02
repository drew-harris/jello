import { CodeView, type FileDiffMetadata } from "@pierre/diffs"
import { createEffect, on, onCleanup, onMount } from "solid-js"
import { usePlugin, type SessionScreen } from "@opencode/plugin/gui"
import { diffThemeCSS } from "./theme"
import { createDiffStack, stackFileIndex } from "./stack"
import { errorMessage } from "../errors"
import { normalizeDiffFontSize, type definition } from "../../../gui/definition"
import { createDiffComments, type DiffAnnotation } from "./comments"

export function MultiFileDiff(props: {
  files: FileDiffMetadata[]
  layout: "unified" | "split"
  wrap: boolean
  selected: number
  navigation: number
  select(index: number): void
  screen: SessionScreen
}) {
  const ctx = usePlugin<typeof definition>()
  let container!: HTMLDivElement
  const viewer = new CodeView<DiffAnnotation["metadata"]>()
  const items = createDiffStack<DiffAnnotation["metadata"]>()
  const comments = createDiffComments(() => props.screen, () => viewer.setSelectedLines(null))
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
    const unsubscribe = viewer.subscribeToScroll((scrollTop) => {
      const files = props.files
      const index = stackFileIndex(files.length, (index) => viewer.getTopForItem(files[index].name) ?? Infinity, scrollTop)
      if (index >= 0) props.select(index)
    })
    onCleanup(unsubscribe)
  })
  createEffect(() => {
    viewer.setOptions({
      diffStyle: props.layout,
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
      itemMetrics: { lineHeight: lineHeight(), hunkSeparatorHeight: 24, spacing: 0 },
      layout: { paddingTop: 0, paddingBottom: 16, gap: 12 },
      unsafeCSS: `${diffThemeCSS(ctx.appearance.mode() === "dark")}
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
      onPostRender: (node, _instance, phase) => {
        if (phase === "unmount") return
        const root = node.shadowRoot ?? node
        for (const title of root.querySelectorAll<HTMLElement>("[data-header-content] [data-title], [data-header-content] [data-prev-name]")) {
          const path = title.textContent ?? ""
          title.setAttribute("role", "button")
          title.tabIndex = 0
          title.title = `Copy file path: ${path}`
          title.setAttribute("aria-label", `Copy file path: ${path}`)
          title.onclick = () => { void copyPath(path) }
          title.onkeydown = (event) => {
            if (event.key !== "Enter" && event.key !== " ") return
            event.preventDefault()
            event.stopPropagation()
            void copyPath(path)
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

import { createSignal, onMount } from "solid-js"
import { render } from "solid-js/web"
import { FileView } from "../../src/features/intelligence/file-view"
import { CodePeekPanel } from "../../src/features/intelligence/peek-panel"
import { createFileViewModel } from "../../src/features/intelligence/file-model"
import type { LanguageClient } from "../../src/features/intelligence/client"
import type { PeekLocation } from "../../src/features/intelligence/rpc"
import type { FileChangeProvider } from "../../src/features/intelligence/file-changes"
import type { MountedSession } from "@opencode/plugin/gui"
import { createCodePeek } from "../../src/features/jj/diff/intelligence/peek"
import { openFileClick } from "../../src/features/jj/diff/file-open"
import "../../src/features/intelligence/style.css"

const at = (path: string, line = 0): PeekLocation => ({ path, line, character: line === 0 ? 13 : 12, endLine: line, endCharacter: line === 0 ? 18 : 17 })
const contents: Record<string, string> = {
  "/repo/main.ts": ["export const value = 42", "console.log(value)", ...Array.from({ length: 2000 }, (_, index) => `export const item${index} = ${index}`)].join("\n"),
  "/repo/definition.ts": "export const value = 42\nconsole.log(value)\n// end of complete file\n",
}
const calls: string[] = []
const fileChanges: FileChangeProvider = async () => ({ markers: [
  { line: 0, kind: "modified", layer: "current" },
  { line: 1, kind: "added", layer: "branch" },
  { line: 2, kind: "deleted", layer: "current" },
  { line: 1000, kind: "modified", layer: "branch" },
] })
const client: LanguageClient = {
  async document(path) { calls.push(`document:${path}`); return { path, text: contents[path], queryable: true } },
  async lookup(position, kind) {
    calls.push(`${kind}:${position.path}`)
    return { locations: kind === "documentHighlight" ? [at(position.path), at(position.path, 1)]
      : kind === "references" ? [at("/repo/main.ts"), at("/repo/main.ts", 1)] : [at("/repo/definition.ts")], truncated: false }
  },
  async hover() { calls.push("hover"); return { text: "const value: 42\n<script>must remain plain text</script>" } },
}

async function modalEscapeRegression() {
  const results = []
  for (const focus of ["header button", ".jello-file-view"]) {
    const opener = document.querySelector<HTMLButtonElement>("[data-testid=open-peek]")!
    opener.focus()
    opener.click()
    await Promise.resolve()
    const modal = document.querySelector<HTMLDialogElement>("dialog[open]")!
    modal.querySelectorAll<HTMLButtonElement>(".jello-file-results button")[1]!.click()
    modal.querySelector<HTMLElement>(focus)!.focus()
    const key = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true, cancelable: true })
    document.activeElement!.dispatchEvent(key)
    const cancel = new Event("cancel", { cancelable: true })
    modal.dispatchEvent(cancel)
    const back = modal.querySelector<HTMLButtonElement>("[aria-label='Back (Escape / Alt+Left)']")!
    const forward = modal.querySelector<HTMLButtonElement>("[aria-label='Forward (Alt+Right)']")!
    const result = { focus, stayedOpen: modal.open, atRoot: back.disabled, forwardAvailable: !forward.disabled,
      preventedKey: key.defaultPrevented, preventedCancel: cancel.defaultPrevented }
    if (!result.stayedOpen || !result.atRoot || !result.forwardAvailable || !result.preventedKey || !result.preventedCancel) {
      throw new Error(`Modal Escape regression: ${JSON.stringify(result)}`)
    }
    modal.querySelector<HTMLButtonElement>("[aria-label='Close peek (Escape)']")!.click()
    results.push(result)
  }
  return results
}

function Harness() {
  const model = createFileViewModel(client, fileChanges)
  // Exercise the actual JJ launch model without repository or LSP requests.
  const session = { directory: "/repo", server: { id: "mock", client: { rpc: () => ({
    document: ({ path }: { path: string }, { signal }: { signal: AbortSignal }) => client.document(path, signal),
    events: { on: () => () => {} },
  }) } } } as unknown as MountedSession
  const filePeek = createCodePeek(() => session, () => "mock-revision", () => true)
  const [peekOpened, setPeekOpened] = createSignal(false)
  const initial = { locations: [at("/repo/main.ts"), at("/repo/main.ts", 1)], truncated: false }
  onMount(() => { void model.seed({ label: "References: value", locations: [at("/repo/main.ts"), at("/repo/main.ts", 1)], truncated: false }) })
  Object.assign(window, { fileViewTest: { model, calls, modalEscapeRegression, filePeek } })
  return <main>
    <h1>Read-only file view smoke test</h1>
    <p>Mock LSP, real virtualized renderer. No repository changes or server queries.</p>
    <button type="button" data-testid="open-peek" onClick={() => setPeekOpened(true)}>Open peek modal</button>
    <button type="button" data-testid="open-file" onClick={(event) => openFileClick(event, "main.ts", filePeek.openFile)}>Cmd-click main.ts</button>
    <CodePeekPanel directory="/repo" peek={{ ...filePeek, fileChanges }} />
    <CodePeekPanel directory="/repo" peek={{ opened: peekOpened, kind: () => "references", target: () => ({ text: "value" }),
      result: () => initial, loading: () => false, error: () => "", client, fileChanges,
      open: async () => {}, close: () => setPeekOpened(false), keydown: (event) => {
        if (event.key === "Escape") { event.preventDefault(); setPeekOpened(false) }
      },
    }} />
    <section class="jello-peek" data-mode="light" style={{ height: "620px", "max-height": "none", width: "100%" }}>
      <FileView model={model} directory="/repo" />
    </section>
  </main>
}

render(() => <Harness />, document.getElementById("app")!)

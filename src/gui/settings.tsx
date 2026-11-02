import { usePlugin } from "@opencode/plugin/gui"
import { createSignal } from "solid-js"
import { version } from "../../package.json"
import { DIFF_FONT_SIZE_MAX, DIFF_FONT_SIZE_MIN, normalizeDiffFontSize, type definition } from "./definition"

export function SettingsView(_props: { readonly highlight?: string }) {
  const ctx = usePlugin<typeof definition>()
  const diff = ctx.stores.jjDiff
  const [fontSizeInput, setFontSizeInput] = createSignal(String(normalizeDiffFontSize(diff.value.fontSize)))
  const saveFontSize = () => {
    const input = fontSizeInput().trim()
    const parsed = Number(input)
    if (!input || !Number.isFinite(parsed)) {
      setFontSizeInput(String(normalizeDiffFontSize(diff.value.fontSize)))
      return
    }
    const fontSize = normalizeDiffFontSize(parsed)
    setFontSizeInput(String(fontSize))
    if (fontSize !== normalizeDiffFontSize(diff.value.fontSize)) {
      diff.update((draft) => { draft.fontSize = fontSize })
    }
  }

  return (
    <div class="jello-settings">
      <div class="jello-settings-field" id="font-size" data-highlight={_props.highlight === "font-size" || undefined}>
        <label for="jello-diff-font-size">Diff code font size</label>
        <p id="jello-diff-font-size-description">Font size used for code in the JJ diff panel.</p>
        <div class="jello-settings-number">
          <input id="jello-diff-font-size" type="number" min={DIFF_FONT_SIZE_MIN} max={DIFF_FONT_SIZE_MAX} step="1"
            value={fontSizeInput()} aria-describedby="jello-diff-font-size-description"
            onInput={(event) => setFontSizeInput(event.currentTarget.value)} onBlur={saveFontSize}
            onKeyDown={(event) => { if (event.key === "Enter") saveFontSize() }} />
          <span aria-hidden="true">px</span>
        </div>
      </div>
      <p class="jello-settings-version">Jello v{version}</p>
    </div>
  )
}

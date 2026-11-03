// A modal has one Escape owner, regardless of which control has keyboard focus.
// Native `cancel` can follow keydown, so it must not perform a second action.
export function createPeekEscape(options: {
  escape(): boolean
  close(): void
  inMenu(event: KeyboardEvent): boolean
}) {
  let key: KeyboardEvent | undefined
  const unwind = () => { if (!options.escape()) options.close() }
  return {
    keydown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      key = event
      if (event.defaultPrevented || event.isComposing || options.inMenu(event)) return
      event.preventDefault()
      event.stopPropagation()
      // Key repeat may unwind history, but closing requires a fresh press.
      if (!options.escape() && !event.repeat) options.close()
    },
    keyup(event: KeyboardEvent) {
      if (event.key === "Escape") key = undefined
    },
    cancel(event: Event) {
      event.preventDefault()
      if (!key?.defaultPrevented && !key?.isComposing) unwind()
    },
  }
}

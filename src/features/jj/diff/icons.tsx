export type DiffIconName = "tree" | "search" | "previous" | "next" | "refresh" | "wrap" | "unified" | "split" | "chevron"
const paths: Record<DiffIconName, string> = {
  tree: "M3 2v12M3 5h4m-4 6h4M8 3h6v4H8zM8 9h6v4H8z",
  search: "M11 11l4 4M13 7a6 6 0 1 1-12 0 6 6 0 0 1 12 0",
  previous: "M14 8H2m5-5L2 8l5 5",
  next: "M2 8h12M9 3l5 5-5 5",
  refresh: "M14 6a6 6 0 1 0 0 5M14 2v4h-4",
  wrap: "M2 4h12M2 8h9a3 3 0 0 1 0 6H8m2-2-2 2 2 2M2 12h3",
  unified: "M2 2h12v12H2zM2 8h12",
  split: "M2 2h12v12H2zM8 2v12",
  chevron: "m5 3 5 5-5 5",
}
export function DiffIcon(props: { name: DiffIconName; class?: string }) {
  return <svg class={props.class} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[props.name]} /></svg>
}

export function FileIcon(props: { name: string }) {
  const extension = () => props.name.split(".").pop()?.toLowerCase()
  return <span class="jello-jj-diff-file-icon" classList={{ "is-react": extension() === "tsx" || extension() === "jsx" }} aria-hidden="true">
    {extension() === "tsx" || extension() === "jsx" ? <svg width="16" height="16" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" stroke-width="1.1">
      <ellipse rx="11" ry="4" /><ellipse rx="11" ry="4" transform="rotate(60)" /><ellipse rx="11" ry="4" transform="rotate(120)" /><circle r="1.4" fill="currentColor" />
    </svg> : ({ ts: "TS", js: "JS", css: "#", json: "{}", md: "M↓", lock: "◉" }[extension() ?? ""] ?? "◇")}
  </span>
}

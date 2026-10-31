export function summarizeStatus(text: string): string {
  const change = text.match(/^Working copy\s+\(@\)\s*:\s*(\S+)/m)?.[1]
  const counts = new Map<string, number>()
  const labels: Record<string, string> = {
    M: "modified",
    A: "added",
    D: "deleted",
    R: "renamed",
    C: "copied",
  }

  for (const line of text.split("\n")) {
    const kind = line.match(/^([MADRC]) /)?.[1]
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }

  const parts = ["jj"]
  if (change) parts.push(change)
  for (const [kind, count] of counts) parts.push(`${count} ${labels[kind]}`)
  const conflicts = /^.*unresolved conflicts.*$/m.test(text)
  if (conflicts) parts.push("conflicts")
  return parts.join(" · ")
}

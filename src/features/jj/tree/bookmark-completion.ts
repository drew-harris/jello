export function matchingBookmarks(names: readonly string[], input: string): string[] {
  const query = input.trim()
  const lower = query.toLowerCase()
  const rank = (name: string) => name === query ? 0 : name.toLowerCase().startsWith(lower) ? 1 : 2
  return names.filter((name) => name.toLowerCase().includes(lower)).sort((a, b) => rank(a) - rank(b))
}

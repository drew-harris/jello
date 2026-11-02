import type { ThemedToken } from "@pierre/diffs"

export interface PreviewSegment { text: string; color?: string; fontStyle?: number; highlighted: boolean }

// Split syntax runs at the symbol's boundaries without losing their colors.
// Use line-relative UTF-16 offsets, just like the LSP ranges.
export function previewSegments(line: string, tokens: ThemedToken[] | undefined, start: number, end: number): PreviewSegment[] {
  const runs = tokens?.length ? tokens : [{ content: line || " ", offset: 0 }]
  const result: PreviewSegment[] = []
  let offset = 0
  for (const token of runs) {
    const to = offset + token.content.length
    const boundaries = [...new Set([offset, Math.max(offset, Math.min(to, start)), Math.max(offset, Math.min(to, end)), to])].sort((a, b) => a - b)
    for (let index = 1; index < boundaries.length; index++) {
      const from = boundaries[index - 1]
      const until = boundaries[index]
      if (from === until) continue
      result.push({ text: token.content.slice(from - offset, until - offset), color: token.color, fontStyle: token.fontStyle,
        highlighted: from >= start && until <= end && end > start })
    }
    offset = to
  }
  return result
}

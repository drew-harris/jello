export interface LineChanges {
  modified: number
  added: number
  deleted: number
}

// Pair replacements within a contiguous edit block, never across files or hunks.
// Binary changes do not contribute text lines.
export function countLineChanges(diff: string): LineChanges {
  const counts: LineChanges = { modified: 0, added: 0, deleted: 0 }
  let added = 0
  let deleted = 0
  let inHunk = false
  const flush = () => {
    const modified = Math.min(added, deleted)
    counts.modified += modified
    counts.added += added - modified
    counts.deleted += deleted - modified
    added = deleted = 0
  }
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      flush()
      inHunk = false
    } else if (line.startsWith("@@ ")) {
      flush()
      inHunk = true
    } else if (inHunk && line.startsWith("+")) {
      added++
    } else if (inHunk && line.startsWith("-")) {
      deleted++
    } else if (!line.startsWith("\\ No newline")) {
      flush()
    }
  }
  flush()
  return counts
}

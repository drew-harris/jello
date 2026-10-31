export interface Revision {
  changeID: string
  bookmarks: string[]
  description: string
  empty: boolean
  immutable: boolean
  current: boolean
}

export interface Overview {
  text: string
  revisions: Revision[]
}

// JSON-encode each field so quotes, newlines, and Unicode remain safe to parse.
export const revisionTemplate = [
  "\"{\"",
  "'\"changeID\":' ++ json(self.change_id().shortest().prefix())",
  "',\"bookmarks\":' ++ json(bookmarks.map(|b| b.name()))",
  "',\"description\":' ++ json(description.first_line())",
  "',\"empty\":' ++ json(empty)",
  "',\"immutable\":' ++ json(immutable)",
  "',\"current\":' ++ json(current_working_copy)",
  "\"}\\n\"",
].join(" ++ ")

export function parseRevisions(text: string): Revision[] {
  return text.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as Revision)
}

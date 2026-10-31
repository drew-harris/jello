import type { LineChanges } from "./line-changes"

export interface Revision {
  commitID: string
  changeID: string
  changeID8: string
  fullChangeID?: string
  divergent?: boolean
  timestamp: string
  bookmarks: string[]
  description: string
  empty: boolean
  immutable: boolean
  current: boolean
  depth: number
}

export interface Overview {
  text: string
  revisions: Revision[]
  lines: LineChanges
}

// JSON-encode each field so quotes, newlines, and Unicode remain safe to parse.
export const revisionTemplate = [
  "\"{\"",
  "'\"commitID\":' ++ json(self.commit_id()) ++ ','",
  "'\"fullChangeID\":' ++ json(self.change_id()) ++ ','",
  "'\"divergent\":' ++ json(divergent) ++ ','",
  "'\"changeID\":' ++ json(self.change_id().shortest().prefix())",
  "',\"changeID8\":' ++ json(self.change_id().short(8))",
  "',\"timestamp\":' ++ json(committer.timestamp().format(\"%Y-%m-%dT%H:%M:%S%:z\"))",
  "',\"bookmarks\":' ++ json(bookmarks.map(|b| b.name()))",
  "',\"description\":' ++ json(description.first_line())",
  "',\"empty\":' ++ json(empty)",
  "',\"immutable\":' ++ json(immutable)",
  "',\"current\":' ++ json(current_working_copy)",
  "',\"depth\":' ++ if(current_working_copy, \"0\", if(self.contained_in(\"parents(@)\"), \"1\", \"2\"))",
  "\"}\\n\"",
].join(" ++ ")

export function parseRevisions(text: string): Revision[] {
  return text.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as Revision)
}

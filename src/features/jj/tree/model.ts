export interface TreeCommit {
  commitID: string
  changeID: string
  changeIDPrefix: string
  parents: string[]
  description: string
  author: string
  timestamp: string
  bookmarks: string[]
  bookmarkLabels?: string[]
  remoteBookmarkLabels?: string[]
  current: boolean
  immutable: boolean
  empty: boolean
  conflict: boolean
  divergent: boolean
}

export interface TreeHistory {
  commits: TreeCommit[]
  hasMore: boolean
}

export const treeTemplate = [
  '"{"',
  "'\"commitID\":' ++ json(self.commit_id())",
  "',\"changeID\":' ++ json(self.change_id())",
  "',\"changeIDPrefix\":' ++ json(self.change_id().shortest().prefix())",
  "',\"parents\":' ++ json(parents.map(|p| p.commit_id()))",
  "',\"description\":' ++ json(description)",
  "',\"author\":' ++ json(author.name())",
  "',\"timestamp\":' ++ json(committer.timestamp().format(\"%Y-%m-%dT%H:%M:%S%:z\"))",
  "',\"bookmarks\":' ++ json(local_bookmarks.map(|b| b.name()))",
  "',\"bookmarkLabels\":' ++ json(bookmarks.map(|b| stringify(b)))",
  "',\"remoteBookmarkLabels\":' ++ json(bookmarks.filter(|b| b.remote()).map(|b| stringify(b)))",
  "',\"current\":' ++ json(current_working_copy)",
  "',\"immutable\":' ++ json(immutable)",
  "',\"empty\":' ++ json(empty)",
  "',\"conflict\":' ++ json(conflict)",
  "',\"divergent\":' ++ json(divergent)",
  '"}\\n"',
].join(" ++ ")

export function parseHistory(text: string, limit: number): TreeHistory {
  const commits = text.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as TreeCommit)
  return { commits: commits.slice(0, limit), hasMore: commits.length > limit }
}

export function changeIDLabel(commit: Pick<TreeCommit, "changeID" | "changeIDPrefix">) {
  const prefix = commit.changeIDPrefix
  return { prefix, rest: commit.changeID.slice(prefix.length, Math.max(8, prefix.length)) }
}

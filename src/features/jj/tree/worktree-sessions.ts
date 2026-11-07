export interface WorktreeSession {
  sessionID: string
  title: string
  directory: string
  workspace: string
  commitID: string
  busy: boolean
}

export interface WorktreeSessionSnapshot {
  worktreeSessions: WorktreeSession[]
  worktreeSessionsTruncated: boolean
}

// Exact commit identity is essential: following a change ID here could mark the
// wrong divergent version. Never group sessions from another server's response.
export function worktreeSessionGroups(sessions: readonly WorktreeSession[], currentSessionID: string, visibleCommitIDs: ReadonlySet<string>) {
  const rows = new Map<string, WorktreeSession[]>()
  const outside: WorktreeSession[] = []
  for (const session of sessions) {
    if (session.sessionID === currentSessionID) continue
    if (!visibleCommitIDs.has(session.commitID)) { outside.push(session); continue }
    const group = rows.get(session.commitID) ?? []
    group.push(session)
    rows.set(session.commitID, group)
  }
  return { rows, outside }
}

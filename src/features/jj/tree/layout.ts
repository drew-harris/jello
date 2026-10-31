import type { TreeCommit } from "./model"

export const ROW_HEIGHT = 42
export const LANE_WIDTH = 18
export const laneX = (lane: number) => 18 + lane * LANE_WIDTH

export interface GraphEdge {
  from: number
  to: number
  color: number
  missing?: boolean
}

export interface GraphRow {
  commit: TreeCommit
  lane: number
  color: number
  edges: GraphEdge[]
  missingParents: string[]
}

// Each row owns the connections from its node center to the next row's center.
// Intermediate lanes pass straight through; only the visited node can branch.
export function layoutHistory(commits: TreeCommit[]): { rows: GraphRow[]; lanes: number } {
  const visible = new Set(commits.map((commit) => commit.commitID))
  let lanes: ({ id: string; color: number } | undefined)[] = []
  let nextColor = 0
  let width = 1
  const rows: GraphRow[] = []
  for (const commit of commits) {
    let lane = lanes.findIndex((item) => item?.id === commit.commitID)
    if (lane < 0) {
      lane = lanes.findIndex((item) => !item)
      if (lane < 0) lane = lanes.length
      lanes[lane] = { id: commit.commitID, color: nextColor++ % 6 }
    }
    const color = lanes[lane]!.color
    const before = lanes.slice()
    lanes[lane] = undefined
    const edges: GraphEdge[] = []
    const parents = commit.parents.filter((id) => visible.has(id))
    for (const [index, id] of parents.entries()) {
      let target = lanes.findIndex((item) => item?.id === id)
      if (target < 0) {
        // Reserve continuing lanes before assigning another parent a new lane.
        target = index === 0 && !lanes[lane] ? lane : lanes.findIndex((item) => !item)
        if (target < 0) target = lanes.length
        lanes[target] = { id, color: index === 0 ? color : nextColor++ % 6 }
      }
      edges.push({ from: lane, to: target, color: lanes[target]!.color })
    }
    before.forEach((item, index) => {
      if (item && index !== lane) edges.push({ from: index, to: index, color: item.color })
    })
    const missingParents = commit.parents.filter((id) => !visible.has(id))
    // A mixed merge needs a separate capped stub, not dashes hidden under a
    // solid visible-parent edge. The stub never becomes an active graph lane.
    const boundaryLane = parents.length ? lanes.length : lane
    if (missingParents.length) edges.push({ from: lane, to: boundaryLane, color, missing: true })
    width = Math.max(width, lane + 1, lanes.length, missingParents.length ? boundaryLane + 1 : 0)
    rows.push({ commit, lane, color, edges, missingParents })
    while (lanes.length && !lanes.at(-1)) lanes.pop()
  }
  return { rows, lanes: width }
}

export function edgePath(from: number, to: number, y: number): string {
  const x1 = laneX(from)
  const x2 = laneX(to)
  return x1 === x2
    ? `M ${x1} ${y} V ${y + ROW_HEIGHT}`
    : `M ${x1} ${y} C ${x1} ${y + ROW_HEIGHT / 2}, ${x2} ${y + ROW_HEIGHT / 2}, ${x2} ${y + ROW_HEIGHT}`
}

import { strict as assert } from "node:assert"
import { test } from "node:test"
import { edgePath, laneX, layoutHistory, rowOffsets, ROW_HEIGHT } from "./layout"
import { changeIDLabel, parseHistory, type TreeCommit } from "./model"

const commit = (commitID: string, parents: string[] = [], extra: Partial<TreeCommit> = {}): TreeCommit => ({
  commitID, parents, changeID: commitID, changeIDPrefix: commitID, description: "", author: "Test", timestamp: "2026-10-31T00:00:00Z",
  bookmarks: [], current: false, immutable: false, empty: false, conflict: false, divergent: false, ...extra,
})

test("linear history uses one continuous lane", () => {
  const graph = layoutHistory([commit("a", ["b"]), commit("b", ["c"]), commit("c")])
  assert.equal(graph.lanes, 1)
  assert.deepEqual(graph.rows.map((row) => row.lane), [0, 0, 0])
  assert.deepEqual(graph.rows.map((row) => row.edges.length), [1, 1, 0])
  assert.equal(graph.rows[0].color, graph.rows[2].color)
})

test("merge opens lanes and shared ancestry converges", () => {
  const graph = layoutHistory([commit("merge", ["a", "b"]), commit("a", ["base"]), commit("b", ["base"]), commit("base")])
  assert.equal(graph.lanes, 2)
  assert.deepEqual(graph.rows.map((row) => row.lane), [0, 0, 1, 0])
  assert.deepEqual(graph.rows[0].edges.map(({ from, to }) => [from, to]), [[0, 0], [0, 1]])
  assert.ok(graph.rows[1].edges.some((edge) => edge.from === 1 && edge.to === 1))
  assert.ok(graph.rows[2].edges.some((edge) => edge.from === 1 && edge.to === 0))
})

test("separate heads join their common parent without collapsing passing lanes", () => {
  const graph = layoutHistory([commit("a", ["base"]), commit("b", ["base"]), commit("base")])
  assert.deepEqual(graph.rows.map((row) => row.lane), [0, 1, 0])
  assert.deepEqual(graph.rows[1].edges.map(({ from, to }) => [from, to]), [[1, 0], [0, 0]])
})

test("octopus merge allocates one lane per parent", () => {
  const graph = layoutHistory([commit("m", ["a", "b", "c"]), commit("a", ["r"]), commit("b", ["r"]), commit("c", ["r"]), commit("r")])
  assert.equal(graph.lanes, 3)
  assert.equal(graph.rows[0].edges.length, 3)
  assert.equal(graph.rows.at(-1)?.edges.length, 0)
})

test("filtered ancestry terminates explicitly without inventing edges", () => {
  const graph = layoutHistory([commit("a", ["hidden"]), commit("older")])
  assert.deepEqual(graph.rows[0].missingParents, ["hidden"])
  assert.equal(graph.rows[0].edges[0].missing, true)
  assert.equal(graph.rows[1].edges.length, 0)
})

test("mixed visible and omitted merge parents are both represented", () => {
  const graph = layoutHistory([commit("a", ["b", "hidden"]), commit("b")])
  assert.equal(graph.rows[0].edges.filter((edge) => !edge.missing).length, 1)
  assert.deepEqual(graph.rows[0].missingParents, ["hidden"])
})

test("divergent changes remain separate nodes keyed by commit ID", () => {
  const graph = layoutHistory([commit("a", ["r"], { changeID: "same", divergent: true }), commit("b", ["r"], { changeID: "same", divergent: true }), commit("r")])
  assert.equal(graph.rows.length, 3)
  assert.notEqual(graph.rows[0].lane, graph.rows[1].lane)
})

test("empty history is valid and layout is deterministic", () => {
  assert.deepEqual(layoutHistory([]), { rows: [], lanes: 1 })
  const commits = [commit("a", ["b", "c"]), commit("b"), commit("c")]
  assert.deepEqual(layoutHistory(commits), layoutHistory(commits))
})

test("SVG paths align exactly with row centers", () => {
  const center = ROW_HEIGHT / 2
  assert.equal(edgePath(0, 0, center), `M ${laneX(0)} ${center} V ${center + ROW_HEIGHT}`)
  assert.ok(edgePath(0, 1, center).endsWith(`${laneX(1)} ${center + ROW_HEIGHT}`))
})

test("expanded rows move graph nodes and edge endpoints by their measured height", () => {
  const commits = [commit("a", ["b"]), commit("b", ["c"]), commit("c")]
  const offsets = rowOffsets(commits, { a: 180, b: 90 })
  assert.deepEqual(offsets, [0, 180, 270, 270 + ROW_HEIGHT])
  const center = ROW_HEIGHT / 2
  assert.equal(edgePath(0, 0, center, 180), `M ${laneX(0)} ${center} V ${180 + center}`)
  assert.ok(edgePath(0, 1, center, 180).endsWith(`${laneX(1)} ${180 + center}`))
  assert.deepEqual(rowOffsets(commits, { a: 0 }), [0, ROW_HEIGHT, ROW_HEIGHT * 2, ROW_HEIGHT * 3])
})

test("JSON lines preserve multiline descriptions, Unicode, and bookmarks", () => {
  const first = commit("a", ["b"], { description: 'Fix "quotes" → done\n\nDetails\n', bookmarks: ["feature/ui"] })
  const text = [first, commit("b"), commit("c")].map((item) => JSON.stringify(item)).join("\n") + "\n"
  assert.deepEqual(parseHistory(text, 2), { commits: [first, commit("b")], hasMore: true })
  assert.equal(parseHistory(text, 3).hasMore, false)
  assert.deepEqual(parseHistory("\n", 100), { commits: [], hasMore: false })
})

test("change IDs highlight only the repository-unique prefix", () => {
  assert.deepEqual(changeIDLabel({ changeID: "multkmnuxxxx", changeIDPrefix: "mu" }), { prefix: "mu", rest: "ltkmnu" })
  assert.deepEqual(changeIDLabel({ changeID: "nprypqxxxxxx", changeIDPrefix: "n" }), { prefix: "n", rest: "prypqxx" })
  assert.deepEqual(changeIDLabel({ changeID: "abcdefghijk", changeIDPrefix: "abcdefghi" }), { prefix: "abcdefghi", rest: "" })
})

import { strict as assert } from "node:assert"
import { test } from "node:test"
import { summarizeStatus } from "./status-summary"

test("summarizes the change ID and file counts", () => {
  assert.equal(summarizeStatus(
    "Working copy changes:\nM one.ts\nM two.ts\nA new.ts\nD old.ts\nWorking copy  (@) : tpluwtwk 12345678 (no description set)\n",
  ), "jj · tpluwtwk · 2 modified · 1 added · 1 deleted")
})

test("shows clean working copies", () => {
  assert.equal(summarizeStatus(
    "The working copy has no changes.\nWorking copy (@) : abcdefgh 12345678 (empty)\n",
  ), "jj · abcdefgh · clean")
})

test("flags unresolved conflicts", () => {
  assert.equal(summarizeStatus(
    "M file.ts\nWorking copy (@) : abcdefgh 12345678\nThese files have unresolved conflicts:\nfile.ts 2-sided conflict\n",
  ), "jj · abcdefgh · 1 modified · conflicts")
})

test("does not treat filenames containing conflict as conflicts", () => {
  assert.equal(summarizeStatus("M conflict.ts\n"), "jj · 1 modified")
})

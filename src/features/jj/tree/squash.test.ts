import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { readSquashDetails, squashBelow } from "./squash"
import { squashDescription } from "./squash-model"
import { readTree } from "./server"

const execute = promisify(execFile)
async function repository(run: (directory: string, jj: (args: string[]) => Promise<{ stdout: string }>) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "jello-squash-"))
  const jj = (args: string[]) => execute("jj", args, { cwd: directory })
  try {
    await jj(["git", "init"])
    await jj(["config", "set", "--repo", "user.name", "Jello Test"])
    await jj(["config", "set", "--repo", "user.email", "test@example.com"])
    await jj(["config", "set", "--repo", "revsets.log", "::"])
    await run(directory, jj)
  } finally { await rm(directory, { recursive: true, force: true }) }
}

test("squash descriptions preserve either message or combine parent first", () => {
  assert.equal(squashDescription("Parent\n\nDetails\n", "Source\n"), "Parent\n\nDetails\n\nSource")
  assert.equal(squashDescription("Parent\n", ""), "Parent")
  assert.equal(squashDescription("", "Source\n"), "Source")
  assert.equal(squashDescription(" \n", ""), "")
})

test("squash validates both exact IDs before running JJ", async () => {
  await assert.rejects(readSquashDetails("/nonexistent", "@"), /full commit ID/)
  await assert.rejects(squashBelow("/nonexistent", "a".repeat(40), "all()"), /full commit ID/)
})

for (const [parentMessage, sourceMessage] of [["Parent", "Source"], ["Parent", ""], ["", "Source"], ["", ""]]) {
  test(`squash handles descriptions ${JSON.stringify([parentMessage, sourceMessage])} and moves all files`, async () => {
    await repository(async (directory, jj) => {
      await writeFile(join(directory, "parent.txt"), "parent\n")
      await jj(["commit", "-m", parentMessage])
      const parent = (await readTree(directory, 20)).commits.find((commit) => !commit.current && !/^0+$/.test(commit.commitID))!
      await writeFile(join(directory, "source.txt"), "source\n")
      await jj(["describe", "-m", sourceMessage])
      const source = (await readTree(directory, 20)).commits.find((commit) => commit.current)!
      const details = await readSquashDetails(directory, source.commitID)
      assert.equal(details.parents.length, 1)
      assert.equal(details.parents[0].commitID, parent.commitID)
      assert.equal(details.sourceDescription.trim(), sourceMessage)
      if (parentMessage && sourceMessage) {
        await assert.rejects(squashBelow(directory, source.commitID, parent.commitID), /Review the combined description/)
      }
      const message = parentMessage && sourceMessage ? "Reviewed parent\n\nReviewed source" : undefined
      await squashBelow(directory, source.commitID, parent.commitID, message)
      const after = (await readTree(directory, 20)).commits
      const squashed = after.find((commit) => commit.changeID === parent.changeID)!
      assert.ok(squashed)
      assert.equal(squashed.description.trim(), message ?? (parentMessage || sourceMessage))
      assert.ok(!after.some((commit) => commit.changeID === source.changeID))
      assert.equal(await readFile(join(directory, "parent.txt"), "utf8"), "parent\n")
      assert.equal(await readFile(join(directory, "source.txt"), "utf8"), "source\n")
    })
  })
}

test("squash rejects nonparents and immutable targets", async () => {
  await repository(async (directory, jj) => {
    await jj(["commit", "-m", "Parent"])
    const before = (await readTree(directory, 20)).commits
    const source = before.find((commit) => commit.current)!
    const parent = before.find((commit) => !commit.current && !/^0+$/.test(commit.commitID))!
    await assert.rejects(squashBelow(directory, source.commitID, "0".repeat(40)), /direct parent/)
    await jj(["config", "set", "--repo", 'revset-aliases."immutable_heads()"', parent.commitID])
    assert.equal((await readSquashDetails(directory, source.commitID)).parents[0].immutable, true)
    await assert.rejects(squashBelow(directory, source.commitID, parent.commitID), /immutable parent/)
    await assert.rejects(readSquashDetails(directory, parent.commitID), /immutable/)
  })
})

test("merge squash lists all parents and targets the explicitly chosen one", async () => {
  await repository(async (directory, jj) => {
    await writeFile(join(directory, "left.txt"), "left\n")
    await jj(["describe", "-m", "Left"])
    const left = (await readTree(directory, 20)).commits.find((commit) => commit.current)!
    await jj(["new", "root()", "-m", "Right"])
    await writeFile(join(directory, "right.txt"), "right\n")
    const right = (await readTree(directory, 20)).commits.find((commit) => commit.current)!
    await jj(["new", left.commitID, right.commitID, "-m", "Merge"])
    await writeFile(join(directory, "merge.txt"), "merge\n")
    const source = (await readTree(directory, 20)).commits.find((commit) => commit.current)!
    const details = await readSquashDetails(directory, source.commitID)
    assert.deepEqual(new Set(details.parents.map((parent) => parent.commitID)), new Set([left.commitID, right.commitID]))
    await squashBelow(directory, source.commitID, right.commitID, "Right and merge")
    const after = (await readTree(directory, 20)).commits
    assert.equal(after.find((commit) => commit.changeID === left.changeID)?.commitID, left.commitID)
    assert.equal(after.find((commit) => commit.changeID === right.changeID)?.description.trim(), "Right and merge")
    assert.ok(!after.some((commit) => commit.changeID === source.changeID))
  })
})

import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { diffBaseOption, resolveDiffBase } from "./base"
import { readRevisionDiff } from "./server"

const execute = promisify(execFile)

test("diff-base options reject invalid values", () => {
  assert.equal(diffBaseOption(undefined), undefined)
  assert.equal(diffBaseOption(" master "), "master")
  for (const value of [false, {}, 42, "", " ", "main\n", "bad\0name"])
    assert.throws(() => diffBaseOption(value), /jjDiffBase/)
})

test("default-branch diffs support master, configured trunk, and explicit bookmark overrides", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jello-diff-base-"))
  try {
    const jj = async (args: string[]) => (await execute("jj", args, { cwd: directory })).stdout
    const options = { cwd: directory, timeout: 30_000, maxBuffer: 1024 * 1024 }
    await jj(["git", "init", "."])
    await jj(["config", "set", "--repo", "user.name", "Jello Test"])
    await jj(["config", "set", "--repo", "user.email", "test@example.com"])
    // Isolate this test from user-level trunk overrides.
    await jj(["config", "set", "--repo", 'revset-aliases."trunk()"', "root()"])
    await writeFile(join(directory, "example.ts"), "const value = 1\n")
    await jj(["new"])
    const base = (await jj(["log", "--no-graph", "-r", "@-", "-T", "commit_id"])).trim()
    await jj(["bookmark", "set", "master", "-r", base])
    assert.deepEqual(await resolveDiffBase(options), { commitID: base, label: "master" })
    await writeFile(join(directory, "example.ts"), "const value = 2\n")
    const tip = (await jj(["log", "--no-graph", "-r", "@", "-T", "commit_id"])).trim()
    const pr = await readRevisionDiff(directory, tip, undefined, undefined, { againstMain: true })
    assert.equal(pr.baseBranch, "master")
    assert.equal(pr.baseCommitID, base)
    assert.ok(pr.patch.includes("+const value = 2"))

    await jj(["bookmark", "set", "develop", "-r", base])
    await jj(["config", "set", "--repo", 'revset-aliases."trunk()"', "develop"])
    assert.equal((await resolveDiffBase(options, "develop")).label, "develop")
    await jj(["bookmark", "delete", "master"])
    assert.deepEqual(await resolveDiffBase(options), { commitID: base, label: "develop" })
    await assert.rejects(resolveDiffBase(options, "missing"), /jjDiffBase/)
    // Treat overrides as literal bookmark names, never executable revsets.
    await assert.rejects(resolveDiffBase(options, 'develop") | all()'), /jjDiffBase/)
    await assert.rejects(resolveDiffBase(options, "@origin"), /Invalid jjDiffBase/)
    await assert.rejects(resolveDiffBase(options, "master@"), /Invalid jjDiffBase/)
    await jj(["config", "set", "--repo", 'revset-aliases."trunk()"', "root()"])
    await assert.rejects(resolveDiffBase(options), /default branch/)

    // Import an actual Git remote-tracking bookmark without network access.
    await jj(["git", "remote", "add", "origin", directory])
    await execute("git", ["update-ref", "refs/remotes/origin/master", base], { cwd: directory })
    await jj(["git", "import"])
    assert.deepEqual(await resolveDiffBase(options, "master@origin"), { commitID: base, label: "master@origin" })
    await jj(["config", "set", "--repo", 'revset-aliases."trunk()"', "master@origin"])
    assert.equal((await resolveDiffBase(options)).commitID, base)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { promisify } from "node:util"

const execute = promisify(execFile)

// Explicit opt-in: this launches installed OpenCode servers, but never uses the
// user's service, database, plugins or credentials. No model/provider is invoked.
test("native OpenCode create/refresh/remove uses Jello's JJ strategy", {
  skip: process.env.JELLO_TEST_OPENCODE !== "1", timeout: 90_000,
}, async () => {
  const parent = join(tmpdir(), "opencode")
  await mkdir(parent, { recursive: true })
  const base = await realpath(await mkdtemp(join(parent, "jello-native-worktrees-")))
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (key.startsWith("OPENCODE_")) delete env[key]
  for (const [key, path] of Object.entries({ XDG_CONFIG_HOME: "config", XDG_DATA_HOME: "data", XDG_STATE_HOME: "state", XDG_CACHE_HOME: "cache" })) {
    env[key] = join(base, path)
    await mkdir(env[key]!, { recursive: true })
  }
  const root = join(base, "main")
  const plugin = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..")
  const api = async (method: string, path: string, data?: unknown, cwd = root) => {
    const { stdout } = await execute("opencode", ["api", "--standalone", method, path, ...(data === undefined ? [] : ["-d", JSON.stringify(data)])], { cwd, env, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 })
    return stdout.trim() ? JSON.parse(stdout) : undefined
  }
  try {
    await execute("jj", ["git", "init", root], { env })
    await execute("jj", ["config", "set", "--repo", "user.name", "Jello Test"], { cwd: root, env })
    await execute("jj", ["config", "set", "--repo", "user.email", "test@example.invalid"], { cwd: root, env })
    await mkdir(join(env.XDG_CONFIG_HOME!, "opencode"))
    await writeFile(join(env.XDG_CONFIG_HOME!, "opencode", "opencode.json"), JSON.stringify({ plugins: [plugin] }))
    await writeFile(join(root, "example.txt"), "base\n")
    await writeFile(join(root, ".gitignore"), "build/\n")
    await execute("jj", ["commit", "-m", "base"], { cwd: root, env })
    await writeFile(join(root, "example.txt"), "working copy contents\n")
    const location = await api("get", "/api/location")
    const projectID = location.project.id
    const created = await api("post", "/api/worktree", { projectID, directory: join(base, "worktrees"), name: "native-jj" })
    await access(join(created.directory, ".jj"))
    assert.equal(await readFile(join(created.directory, "example.txt"), "utf8"), "working copy contents\n")
    const discovered = await api("get", "/api/location", undefined, created.directory)
    assert.equal(discovered.project.id, projectID)
    assert.equal(discovered.project.canonical, root)
    await api("post", "/api/worktree/refresh", { projectID })
    const inventory = await api("get", `/api/worktree?projectID=${projectID}`) as Array<{ directory: string; strategy?: string }>
    assert.equal(inventory.find((entry) => entry.directory === created.directory)?.strategy, "jello.jj")
    // A real Jello JJ operation must work, not just Git repository discovery.
    const status = await api("post", "/api/rpc/jello.jj.status/status", { input: { directory: created.directory } }, created.directory)
    assert.match(status.output.text, /Working copy/)
    await mkdir(join(created.directory, "build"))
    await writeFile(join(created.directory, "build", "cache"), "do not silently delete\n")
    await assert.rejects(api("delete", "/api/worktree", { projectID, directory: created.directory, force: false }), (error: unknown) => {
      const output = error as { stdout?: string; stderr?: string }
      return /forceRequired/.test(`${output.stdout ?? ""}${output.stderr ?? ""}`)
    })
    await access(join(created.directory, "build", "cache"))
    await rm(join(created.directory, "build"), { recursive: true })
    await api("delete", "/api/worktree", { projectID, directory: created.directory, force: false })
    await assert.rejects(access(created.directory))
    const { stdout } = await execute("jj", ["workspace", "list", "--ignore-working-copy", "-T", 'name ++ "\\n"'], { cwd: root, env })
    assert.equal(stdout.trim(), "default")
    // Document the host limitation rather than assuming that saved inventory
    // teaches native discovery how to associate a non-colocated JJ workspace.
    await writeFile(join(env.XDG_CONFIG_HOME!, "opencode", "opencode.json"), JSON.stringify({ plugins: [{ package: plugin, options: { jjWorktrees: { colocate: false } } }] }))
    const noncolocated = await api("post", "/api/worktree", { projectID, directory: join(base, "worktrees"), name: "noncolocated-jj" })
    await assert.rejects(access(join(noncolocated.directory, ".git")))
    const noncolocatedLocation = await api("get", "/api/location", undefined, noncolocated.directory)
    assert.notEqual(noncolocatedLocation.project.id, projectID)
    await api("delete", "/api/worktree", { projectID, directory: noncolocated.directory, force: true })
    await assert.rejects(access(noncolocated.directory))
  } finally { await rm(base, { recursive: true, force: true }) }
})

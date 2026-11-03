import { strict as assert } from "node:assert"
import { test } from "node:test"
import { CommandError, runCommand } from "./command"

const options = { cwd: process.cwd(), timeout: 5_000, maxBuffer: 1024 * 1024 }

test("commands preserve literal arguments, environment, stdout and stderr", async () => {
  const literal = '$(echo unsafe); "quote"\n--no-pager'
  const result = await runCommand(process.execPath, ["-e", "process.stdout.write(JSON.stringify([process.argv[1],process.env.JELLO_TEST]));process.stderr.write('warning')", "--", literal], {
    ...options, env: { ...process.env, JELLO_TEST: "value" },
  })
  assert.deepEqual(JSON.parse(result.stdout), [literal, "value"])
  assert.equal(result.stderr, "warning")
  assert.ok(result.duration >= 0)
})

test("command errors preserve stderr diagnostics and structured cause", async () => {
  await assert.rejects(runCommand(process.execPath, ["-e", "process.stderr.write('  useful failure  ');process.exit(7)"], options), (error: unknown) => {
    assert.ok(error instanceof CommandError)
    assert.equal(error.message, "useful failure")
    assert.equal(error.command, process.execPath)
    assert.ok(error.duration >= 0)
    assert.equal((error.cause as { code: number }).code, 7)
    return true
  })
})

test("commands enforce cancellation, timeouts and output budgets", async () => {
  const controller = new AbortController()
  const running = runCommand(process.execPath, ["-e", "setInterval(()=>{},1000)"], { ...options, signal: controller.signal })
  controller.abort()
  await assert.rejects(running, CommandError)
  await assert.rejects(runCommand(process.execPath, ["-e", "setInterval(()=>{},1000)"], { ...options, timeout: 50 }), CommandError)
  await assert.rejects(runCommand(process.execPath, ["-e", "process.stdout.write('x'.repeat(10000))"], { ...options, maxBuffer: 10 }), /maxBuffer/)
})

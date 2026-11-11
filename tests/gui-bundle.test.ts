import { strict as assert } from "node:assert"
import { test } from "node:test"
import { runInNewContext } from "node:vm"
import { build } from "vite"
import { createRoot } from "solid-js"
import * as solid from "solid-js"
import * as store from "solid-js/store"
import * as web from "solid-js/web"
import * as effect from "effect"
import * as gui from "@opencode/plugin/gui"
import * as rpc from "@opencode/plugin/rpc"
import type { WindowQueries } from "../src/shared/gui/query"

test("the production GUI bundle can start a query without Node process globals", { timeout: 30_000 }, async () => {
  const result = await build({ logLevel: "silent", build: { write: false } })
  const bundle = Array.isArray(result) ? result[0] : result
  if (!("output" in bundle)) throw new Error("Expected one GUI bundle")
  const chunk = bundle.output.find((item) => item.type === "chunk")
  assert.ok(chunk && chunk.type === "chunk")
  const modules: Record<string, unknown> = {
    "solid-js": solid, "solid-js/store": store, "solid-js/web": { ...web, delegateEvents() {} },
    effect, "@opencode/plugin/gui": gui, "@opencode/plugin/rpc": rpc,
  }
  const exports: { default?: { setup(ctx: unknown): void } } = {}
  runInNewContext(chunk.code, {
    exports, require: (id: string) => {
      if (!(id in modules)) throw new Error(`Unexpected external module: ${id}`)
      return modules[id]
    },
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    queueMicrotask, AbortController, TextEncoder, TextDecoder, URL, performance,
    navigator: { userAgent: "Jello bundle smoke test" },
  })
  const provided = new Map<unknown, unknown>()
  let dispose = () => {}
  try {
    createRoot((cleanup) => {
      dispose = cleanup
      exports.default!.setup({
        id: "jello", add() {},
        provide(token: unknown, value: unknown) { provided.set(token, value) },
        use(token: unknown) { return () => ({ status: "active", value: provided.get(token) }) },
      })
    })
    const repositories = [...provided.values()].find((value) => value && typeof value === "object" && "queries" in value) as { queries: WindowQueries }
    assert.ok(repositories)
    assert.equal(await repositories.queries.client.fetchQuery({ queryKey: ["smoke"], queryFn: async () => 42 }), 42)
  } finally { dispose() }
})

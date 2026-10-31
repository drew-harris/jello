import { Rpc } from "@opencode/plugin/rpc"

// RPC contract between the server part (src/index.ts) and its clients, such as the GUI.
export const Hello = Rpc.define({
  id: "jello",
  methods: {
    greet: {
      input: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
  // Required even when empty. Add events as `name: { schema: { type: "object", ... } }`.
  events: {},
})

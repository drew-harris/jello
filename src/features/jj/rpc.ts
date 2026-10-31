import { Rpc } from "@opencode/plugin/rpc"

export const Status = Rpc.define({
  id: "jello.jj.status",
  methods: {
    commit: {
      input: {
        type: "object",
        properties: { directory: { type: "string" }, message: { type: "string", minLength: 1 } },
        required: ["directory", "message"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { committed: { type: "boolean" } },
        required: ["committed"],
        additionalProperties: false,
      },
    },
    overview: {
      input: {
        type: "object",
        properties: { directory: { type: "string" } },
        required: ["directory"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          text: { type: "string" },
          revisions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                changeID: { type: "string" },
                bookmarks: { type: "array", items: { type: "string" } },
                description: { type: "string" },
                empty: { type: "boolean" },
                immutable: { type: "boolean" },
                current: { type: "boolean" },
              },
              required: ["changeID", "bookmarks", "description", "empty", "immutable", "current"],
              additionalProperties: false,
            },
          },
        },
        required: ["text", "revisions"],
        additionalProperties: false,
      },
    },
    status: {
      input: {
        type: "object",
        properties: { directory: { type: "string" } },
        required: ["directory"],
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
  events: {},
})

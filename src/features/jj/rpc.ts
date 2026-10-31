import { Rpc } from "@opencode/plugin/rpc"

const revisionSchema = {
  type: "object",
  properties: {
    commitID: { type: "string" },
    changeID: { type: "string" },
    changeID8: { type: "string" },
    timestamp: { type: "string" },
    bookmarks: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    empty: { type: "boolean" },
    immutable: { type: "boolean" },
    current: { type: "boolean" },
    depth: { type: "integer", minimum: 0, maximum: 2 },
  },
  required: ["commitID", "changeID", "changeID8", "timestamp", "bookmarks", "description", "empty", "immutable", "current", "depth"],
  additionalProperties: false,
}

export const Status = Rpc.define({
  id: "jello.jj.status",
  methods: {
    describe: {
      input: {
        type: "object",
        properties: {
          directory: { type: "string" },
          commitID: { type: "string", pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" },
          message: { type: "string" },
        },
        required: ["directory", "commitID", "message"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { described: { type: "boolean" } },
        required: ["described"],
        additionalProperties: false,
      },
    },
    abandon: {
      input: {
        type: "object",
        properties: {
          directory: { type: "string" },
          commitID: { type: "string", pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" },
        },
        required: ["directory", "commitID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { abandoned: { type: "boolean" } },
        required: ["abandoned"],
        additionalProperties: false,
      },
    },
    tree: {
      input: {
        type: "object",
        properties: { directory: { type: "string" }, limit: { type: "integer", minimum: 20, maximum: 2000 } },
        required: ["directory", "limit"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          hasMore: { type: "boolean" },
          commits: {
            type: "array",
            items: {
              type: "object",
              properties: {
                commitID: { type: "string" }, changeID: { type: "string" },
                changeIDPrefix: { type: "string" },
                parents: { type: "array", items: { type: "string" } },
                description: { type: "string" }, author: { type: "string" }, timestamp: { type: "string" },
                bookmarks: { type: "array", items: { type: "string" } },
                current: { type: "boolean" }, immutable: { type: "boolean" }, empty: { type: "boolean" },
                conflict: { type: "boolean" }, divergent: { type: "boolean" },
              },
              required: ["commitID", "changeID", "changeIDPrefix", "parents", "description", "author", "timestamp", "bookmarks", "current", "immutable", "empty", "conflict", "divergent"],
              additionalProperties: false,
            },
          },
        },
        required: ["commits", "hasMore"],
        additionalProperties: false,
      },
    },
    changedFiles: {
      input: {
        type: "object",
        properties: { directory: { type: "string" } },
        required: ["directory"],
        additionalProperties: false,
      },
      output: {
        type: "array",
        items: {
          type: "object",
          properties: { path: { type: "string" }, status: { type: "string" } },
          required: ["path", "status"],
          additionalProperties: false,
        },
      },
    },
    diff: {
      input: {
        type: "object",
        properties: {
          directory: { type: "string" },
          commitID: { type: "string", minLength: 40, maxLength: 64 },
        },
        required: ["directory", "commitID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { patch: { type: "string" }, revision: revisionSchema },
        required: ["patch", "revision"],
        additionalProperties: false,
      },
    },
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
          lines: {
            type: "object",
            properties: {
              modified: { type: "integer", minimum: 0 },
              added: { type: "integer", minimum: 0 },
              deleted: { type: "integer", minimum: 0 },
            },
            required: ["modified", "added", "deleted"],
            additionalProperties: false,
          },
          revisions: {
            type: "array",
            items: revisionSchema,
          },
        },
        required: ["text", "revisions", "lines"],
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

import { Rpc } from "@opencode/plugin/rpc"

// RPC schema validation disables regex patterns. Validate commit-ID syntax in
// server helpers; use only length constraints in the transport schemas.

const revisionSchema = {
  type: "object",
  properties: {
    commitID: { type: "string" },
    changeID: { type: "string" },
    changeID8: { type: "string" },
    fullChangeID: { type: "string" },
    divergent: { type: "boolean" },
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
    fileChanges: {
      input: {
        type: "object", properties: { directory: { type: "string" }, path: { type: "string" } },
        required: ["directory", "path"], additionalProperties: false,
      },
      output: {
        type: "object", properties: { current: { type: "string" }, branch: { type: "string" }, hash: { type: "string" }, note: { type: "string" } },
        required: ["current", "branch", "hash", "note"], additionalProperties: false,
      },
    },
    diffContext: {
      input: {
        type: "object", properties: {
          directory: { type: "string" }, commitID: { type: "string", minLength: 40, maxLength: 64 }, path: { type: "string", minLength: 1 },
        }, required: ["directory", "commitID", "path"], additionalProperties: false,
      },
      output: {
        type: "object", properties: { patch: { type: "string" } }, required: ["patch"], additionalProperties: false,
      },
    },
    gitPush: {
      input: {
        type: "object", properties: { directory: { type: "string" }, commitID: { type: "string", minLength: 40, maxLength: 64 } },
        required: ["directory", "commitID"], additionalProperties: false,
      },
      output: {
        type: "object", properties: { pushed: { type: "boolean" } }, required: ["pushed"], additionalProperties: false,
      },
    },
    squashDetails: {
      input: {
        type: "object", properties: { directory: { type: "string" }, commitID: { type: "string", minLength: 40, maxLength: 64 } },
        required: ["directory", "commitID"], additionalProperties: false,
      },
      output: {
        type: "object", properties: {
          sourceDescription: { type: "string" },
          parents: { type: "array", items: {
            type: "object", properties: {
              commitID: { type: "string" }, changeID: { type: "string" }, description: { type: "string" }, immutable: { type: "boolean" },
            }, required: ["commitID", "changeID", "description", "immutable"], additionalProperties: false,
          } },
        }, required: ["sourceDescription", "parents"], additionalProperties: false,
      },
    },
    squashBelow: {
      input: {
        type: "object", properties: {
          directory: { type: "string" }, commitID: { type: "string", minLength: 40, maxLength: 64 },
          parentID: { type: "string", minLength: 40, maxLength: 64 }, message: { type: "string" },
        }, required: ["directory", "commitID", "parentID"], additionalProperties: false,
      },
      output: {
        type: "object", properties: { squashed: { type: "boolean" } }, required: ["squashed"], additionalProperties: false,
      },
    },
    edit: {
      input: {
        type: "object",
        properties: { directory: { type: "string" }, commitID: { type: "string", minLength: 40, maxLength: 64 } },
        required: ["directory", "commitID"], additionalProperties: false,
      },
      output: {
        type: "object", properties: { edited: { type: "boolean" } }, required: ["edited"], additionalProperties: false,
      },
    },
    bookmarks: {
      input: {
        type: "object", properties: { directory: { type: "string" } }, required: ["directory"], additionalProperties: false,
      },
      output: { type: "array", items: { type: "string" } },
    },
    setBookmark: {
      input: {
        type: "object",
        properties: {
          directory: { type: "string" }, commitID: { type: "string", minLength: 40, maxLength: 64 }, name: { type: "string", minLength: 1 },
        },
        required: ["directory", "commitID", "name"], additionalProperties: false,
      },
      output: {
        type: "object", properties: { set: { type: "boolean" } }, required: ["set"], additionalProperties: false,
      },
    },
    revisionFiles: {
      input: {
        type: "object",
        properties: { directory: { type: "string" }, commitID: { type: "string", minLength: 40, maxLength: 64 } },
        required: ["directory", "commitID"], additionalProperties: false,
      },
      output: {
        type: "array",
        items: {
          type: "object",
          properties: { path: { type: "string" }, status: { type: "string" } },
          required: ["path", "status"], additionalProperties: false,
        },
      },
    },
    newChange: {
      input: {
        type: "object",
        properties: { directory: { type: "string" }, commitID: { type: "string", minLength: 40, maxLength: 64 } },
        required: ["directory"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { created: { type: "boolean" } },
        required: ["created"],
        additionalProperties: false,
      },
    },
    describe: {
      input: {
        type: "object",
        properties: {
          directory: { type: "string" },
          commitID: { type: "string", minLength: 40, maxLength: 64 },
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
          commitID: { type: "string", minLength: 40, maxLength: 64 },
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
                bookmarkLabels: { type: "array", items: { type: "string" } },
                remoteBookmarkLabels: { type: "array", items: { type: "string" } },
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
          knownCommitID: { type: "string", minLength: 40, maxLength: 64 },
          changeID: { type: "string", minLength: 32, maxLength: 64 },
        },
        required: ["directory"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { patch: { type: "string" }, revision: revisionSchema, unchanged: { type: "boolean" } },
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

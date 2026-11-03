import { Rpc } from "@opencode/plugin/rpc"

export type PeekKind = "definition" | "references"
export const navigationKinds = ["definition", "references", "typeDefinition", "implementation"] as const
export type NavigationKind = typeof navigationKinds[number]
export const lookupKinds = [...navigationKinds, "documentHighlight"] as const
export type LookupKind = typeof lookupKinds[number]
export interface SymbolPosition {
  path: string
  line: number
  character: number
  text: string
  expectedLine: string
}
export interface PeekLocation {
  path: string
  line: number
  character: number
  endLine: number
  endCharacter: number
}
export interface PeekResult { locations: PeekLocation[]; truncated: boolean; sameFile?: boolean }
export interface PeekSource { startLine: number; lines: string[] }
export interface SourceDocument { path: string; text: string; queryable: boolean }
export interface HoverResult { text: string }

const positionProperties = {
  directory: { type: "string" }, path: { type: "string" },
  line: { type: "integer", minimum: 0 }, character: { type: "integer", minimum: 0 },
  expectedLine: { type: "string", maxLength: 100000 },
} as const

export const Intelligence = Rpc.define({
  // Keep the wire ID stable so installed GUI/server versions remain compatible.
  id: "jello.jj.intelligence",
  methods: {
    document: {
      input: {
        type: "object", properties: { directory: { type: "string" }, path: { type: "string" } },
        required: ["directory", "path"], additionalProperties: false,
      },
      output: {
        type: "object", properties: { path: { type: "string" }, text: { type: "string" }, queryable: { type: "boolean" } },
        required: ["path", "text", "queryable"], additionalProperties: false,
      },
    },
    hover: {
      input: { type: "object", properties: positionProperties,
        required: ["directory", "path", "line", "character", "expectedLine"], additionalProperties: false },
      output: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
    },
    restart: {
      input: {
        type: "object", properties: { directory: { type: "string" } }, required: ["directory"], additionalProperties: false,
      },
      output: {
        type: "object", properties: { restarted: { type: "boolean" } }, required: ["restarted"], additionalProperties: false,
      },
    },
    lookup: {
      input: {
        type: "object", properties: {
          ...positionProperties, kind: { enum: lookupKinds },
        }, required: ["directory", "path", "kind", "line", "character", "expectedLine"], additionalProperties: false,
      },
      output: {
        type: "object", properties: {
          locations: { type: "array", items: {
            type: "object", properties: {
              path: { type: "string" }, line: { type: "integer" }, character: { type: "integer" },
              endLine: { type: "integer" }, endCharacter: { type: "integer" },
            }, required: ["path", "line", "character", "endLine", "endCharacter"], additionalProperties: false,
          } }, truncated: { type: "boolean" }, sameFile: { type: "boolean" },
        }, required: ["locations", "truncated"], additionalProperties: false,
      },
    },
    source: {
      input: {
        type: "object", properties: { directory: { type: "string" }, path: { type: "string" }, line: { type: "integer", minimum: 0 } },
        required: ["directory", "path", "line"], additionalProperties: false,
      },
      output: {
        type: "object", properties: { startLine: { type: "integer" }, lines: { type: "array", items: { type: "string" } } },
        required: ["startLine", "lines"], additionalProperties: false,
      },
    },
  }, events: {
    restarted: {
      schema: {
        type: "object", properties: { directory: { type: "string" }, root: { type: "string" } },
        required: ["directory", "root"], additionalProperties: false,
      },
    },
  },
})

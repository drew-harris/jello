import { Rpc } from "@opencode/plugin/rpc"

export type PeekKind = "definition" | "references"
export type LookupKind = PeekKind | "documentHighlight"
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

export const Intelligence = Rpc.define({
  id: "jello.jj.intelligence",
  methods: {
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
          directory: { type: "string" }, path: { type: "string" }, kind: { enum: ["definition", "references", "documentHighlight"] },
          line: { type: "integer", minimum: 0 }, character: { type: "integer", minimum: 0 },
          expectedLine: { type: "string", maxLength: 100000 },
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

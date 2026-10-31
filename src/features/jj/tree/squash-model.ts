export interface SquashParent {
  commitID: string
  changeID: string
  description: string
  immutable: boolean
}

export interface SquashDetails {
  sourceDescription: string
  parents: SquashParent[]
}

export function squashDescription(parent: string, source: string): string {
  return [parent.trim(), source.trim()].filter(Boolean).join("\n\n")
}

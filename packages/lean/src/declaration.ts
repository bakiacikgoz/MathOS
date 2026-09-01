import type { LeanDiagnostic } from "@mathos/domain"

export interface LeanPropositionShape {
  equality?: boolean
  iff?: boolean
  implication?: boolean
  existential?: boolean
  universal?: boolean
  inequality?: boolean
}

export interface LeanDeclarationInspection {
  name: string
  exists: boolean
  type?: string
  normalizedType?: string
  namespace?: string
  constants: string[]
  typeConstructors: string[]
  conclusion?: string
  propositionShape?: LeanPropositionShape
  axioms?: string[]
  diagnostics: LeanDiagnostic[]
  elaborated: boolean
}

export interface InspectDeclarationsOptions {
  timeoutMs?: number
  extraImports?: string[]
}

export interface InspectDeclarationsResult {
  inspections: LeanDeclarationInspection[]
  timedOut: boolean
  failed: boolean
  detail?: string
}

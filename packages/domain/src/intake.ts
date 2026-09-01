import { defaultStatusForKind, isClaimKind, type ClaimKind, type ClaimStatus } from "./model.ts"
import { InvalidClaimInput } from "@mathos/shared"

const INTAKE_VERIFIED_STATUSES = ["KERNEL_VERIFIED", "INDEPENDENTLY_CHECKED", "EXTERNAL_KNOWN"] as const

export interface ResearchObject {
  name: string
  description: string
}

export interface AssumptionDraft {
  id: string
  text: string
}

export interface AmbiguityDraft {
  id: string
  question: string
}

export interface ResearchDraft {
  kind: ClaimKind
  title: string
  normalizedStatement: string
  originalInput: string
  objects: ResearchObject[]
  assumptions: AssumptionDraft[]
  goal?: string
  ambiguities: AmbiguityDraft[]
  suggestedStatus: ClaimStatus
  modelProvenance: {
    provider: string
    model: string
  }
}

export function coerceIntakeStatus(kind: ClaimKind, suggested?: string): ClaimStatus {
  if (suggested && (INTAKE_VERIFIED_STATUSES as readonly string[]).includes(suggested)) {
    return defaultStatusForKind(kind)
  }
  if (kind === "conjecture") return "CONJECTURE"
  return defaultStatusForKind(kind)
}

export function parseResearchDraft(value: unknown, originalInput: string, provenance: { provider: string; model: string }): ResearchDraft {
  if (!value || typeof value !== "object") {
    throw new InvalidClaimInput("Draft must be an object.")
  }
  const raw = value as Record<string, unknown>
  if (!isClaimKind(String(raw.kind ?? ""))) {
    throw new InvalidClaimInput("Draft kind is invalid.")
  }
  const kind = raw.kind as ClaimKind
  const title = String(raw.title ?? "").trim()
  const statement = String(raw.normalizedStatement ?? raw.statement ?? "").trim()
  if (!title) throw new InvalidClaimInput("Draft title is required.")
  if (!statement) throw new InvalidClaimInput("Draft statement is required.")

  return {
    kind,
    title,
    normalizedStatement: statement,
    originalInput,
    objects: asNamedList(raw.objects, "name", "description"),
    assumptions: asIdTextList(raw.assumptions, "H"),
    goal: raw.goal ? String(raw.goal) : undefined,
    ambiguities: asIdTextList(raw.ambiguities, "A", "question"),
    suggestedStatus: coerceIntakeStatus(kind, raw.suggestedStatus ? String(raw.suggestedStatus) : undefined),
    modelProvenance: provenance,
  }
}

function asNamedList(value: unknown, nameKey: string, descKey: string): ResearchObject[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const rec = item as Record<string, unknown>
      return {
        name: String(rec[nameKey] ?? rec.symbol ?? "").trim(),
        description: String(rec[descKey] ?? rec.text ?? "").trim(),
      }
    })
    .filter((item) => item.name)
}

function asIdTextList(value: unknown, prefix: string, textKey?: "text"): AssumptionDraft[]
function asIdTextList(value: unknown, prefix: string, textKey: "question"): AmbiguityDraft[]
function asIdTextList(value: unknown, prefix: string, textKey: "text" | "question" = "text"): Array<AssumptionDraft | AmbiguityDraft> {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const rec = item as Record<string, unknown>
      const id = String(rec.id ?? `${prefix}${index + 1}`)
      const text = String(rec[textKey] ?? rec.text ?? rec.question ?? "").trim()
      if (textKey === "question") return { id, question: text }
      return { id, text }
    })
    .filter((item) => (item.text ?? item.question))
}

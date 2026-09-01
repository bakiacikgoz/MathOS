import type { FormalizationDraft } from "@mathos/domain"
import { hasProofBody } from "@mathos/domain"
import { FormalizationFailed, ProofBodyRejected } from "@mathos/shared"
import type { ModelProvider } from "@mathos/models"
import { FORMALIZE_SYSTEM_PROMPT } from "./formal-prompts.ts"

export function parseFormalizationDraft(value: unknown, provenance: { provider: string; model: string }): FormalizationDraft {
  if (!value || typeof value !== "object") throw new FormalizationFailed("Formalization draft was not an object.")
  const raw = value as Record<string, unknown>
  const declarationName = String(raw.declarationName ?? "").trim()
  const leanStatement = String(raw.leanStatement ?? raw.sourceText ?? "").trim()
  if (!declarationName) throw new FormalizationFailed("declarationName is required.")
  if (!leanStatement) throw new FormalizationFailed("leanStatement is required.")
  if (hasProofBody(leanStatement)) throw new ProofBodyRejected()
  return {
    declarationName,
    leanStatement,
    variableMapping: asPairs(raw.variableMapping),
    assumptionMapping: asPairs(raw.assumptionMapping),
    uncertainties: Array.isArray(raw.uncertainties)
      ? raw.uncertainties
          .filter((item) => item && typeof item === "object")
          .map((item, index) => {
            const rec = item as Record<string, unknown>
            return { id: String(rec.id ?? `U${index + 1}`), note: String(rec.note ?? rec.text ?? "") }
          })
          .filter((item) => item.note)
      : [],
    modelProvenance: provenance,
  }
}

function asPairs(value: unknown): Array<{ natural: string; lean: string }> {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const rec = item as Record<string, unknown>
      return { natural: String(rec.natural ?? ""), lean: String(rec.lean ?? "") }
    })
    .filter((item) => item.natural || item.lean)
}

export async function draftFormalization(
  provider: ModelProvider,
  claim: { id: string; title: string; naturalStatement: string },
  extras?: { previous?: string; diagnostics?: string },
): Promise<FormalizationDraft> {
  const user = extras?.previous
    ? `Claim ${claim.id}: ${claim.title}\n\nNatural:\n${claim.naturalStatement}\n\nPrevious Lean:\n${extras.previous}\n\nDiagnostics:\n${extras.diagnostics ?? ""}\n\nRepair the statement only. Do not change meaning. Do not add a proof.`
    : `Claim ${claim.id}: ${claim.title}\n\n${claim.naturalStatement}`

  return provider.generateStructured({
    schemaName: "formalization_draft",
    messages: [
      { role: "system", content: FORMALIZE_SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    parse: (value) => parseFormalizationDraft(value, { provider: provider.id, model: provider.model }),
  })
}

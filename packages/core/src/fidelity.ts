import type { FidelityFinding, FidelityReview, FidelityVerdict } from "@mathos/domain"
import type { ModelProvider } from "@mathos/models"
import { FIDELITY_SYSTEM_PROMPT } from "./formal-prompts.ts"

const VERDICTS = new Set(["MATCH", "POTENTIAL_MISMATCH", "MISMATCH"])

export function parseFidelityPayload(value: unknown): {
  verdict: FidelityVerdict
  findings: FidelityFinding[]
  naturalSummary: string
  formalBackTranslation: string
} {
  if (!value || typeof value !== "object") {
    return {
      verdict: "POTENTIAL_MISMATCH",
      findings: [{ dimension: "scope", severity: "warning", message: "Auditor returned an invalid payload." }],
      naturalSummary: "",
      formalBackTranslation: "",
    }
  }
  const raw = value as Record<string, unknown>
  const verdict = VERDICTS.has(String(raw.verdict)) ? (raw.verdict as FidelityVerdict) : "POTENTIAL_MISMATCH"
  const findings = Array.isArray(raw.findings)
    ? raw.findings
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const rec = item as Record<string, unknown>
          return {
            dimension: (rec.dimension as FidelityFinding["dimension"]) ?? "scope",
            severity: (rec.severity as FidelityFinding["severity"]) ?? "warning",
            message: String(rec.message ?? ""),
          }
        })
        .filter((item) => item.message)
    : []
  return {
    verdict,
    findings,
    naturalSummary: String(raw.naturalSummary ?? ""),
    formalBackTranslation: String(raw.formalBackTranslation ?? ""),
  }
}

export async function reviewFidelity(
  auditor: ModelProvider,
  input: { claimId: string; naturalStatement: string; leanStatement: string },
): Promise<Omit<FidelityReview, "id" | "workspaceId" | "formalStatementId" | "createdAt">> {
  const parsed = await auditor.generateStructured({
    schemaName: "fidelity_review",
    messages: [
      { role: "system", content: FIDELITY_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Claim ${input.claimId}\n\nNATURAL:\n${input.naturalStatement}\n\nFORMAL:\n${input.leanStatement}`,
      },
    ],
    parse: parseFidelityPayload,
  })
  return {
    claimId: input.claimId,
    verdict: parsed.verdict,
    findings: parsed.findings,
    naturalSummary: parsed.naturalSummary,
    formalBackTranslation: parsed.formalBackTranslation,
    reviewerType: "model",
    provider: auditor.id,
    model: auditor.model,
  }
}

import type { LeanDeclarationInspection } from "@mathos/lean"
import type { FusionMethod, PremiseRetrievalRequest, PremiseRetrievalResult } from "./types.ts"
import { enrichForLean, fuseCandidateRanks } from "./fusion.ts"

export function applyLeanEnrichment(
  header: PremiseRetrievalResult,
  inspections: LeanDeclarationInspection[],
  request: PremiseRetrievalRequest,
  cacheHits: Set<string>,
  fusionMethod: FusionMethod = "SCORE_FUSION",
): PremiseRetrievalResult {
  const exclude = new Set((request.excludeNames ?? []).map((item) => item.toLowerCase()))
  const stage1 = header.candidates.filter((item) => !exclude.has(item.declaration.name.toLowerCase()))
  const adjusted = enrichForLean(stage1, inspections, header.goalProfile ?? null, cacheHits)
  const fused = fuseCandidateRanks(stage1, adjusted, { method: fusionMethod })
  const limit = request.maxPremises ?? 20
  const seen = new Set<string>()
  const final = []
  for (const item of fused.candidates) {
    const key = item.declaration.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    final.push(item)
    if (final.length >= limit) break
  }
  return {
    ...header,
    candidates: final,
    enrichment: "LEAN_ELABORATED",
    inspectedCount: inspections.length,
    fusionMethod,
    localCount: final.filter((item) => item.declaration.origin === "workspace").length,
    mathlibCount: final.filter((item) => item.declaration.origin === "mathlib").length,
  }
}

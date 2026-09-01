import type { LeanDeclaration, PremiseCandidate, PremiseRetrievalRequest } from "./types.ts"
import { tokenize } from "./parse.ts"

const FORBIDDEN = new Set(["DISPROVED", "STALE"])

export function rankDeclarations(
  declarations: LeanDeclaration[],
  request: PremiseRetrievalRequest,
): PremiseCandidate[] {
  const queryTokens = new Set(tokenize(`${request.query} ${request.goal ?? ""} ${request.unknownIdentifiers?.join(" ") ?? ""}`))
  const unknown = new Set((request.unknownIdentifiers ?? []).map((item) => item.toLowerCase()))
  const boosts = new Set((request.localBoosts ?? []).map((item) => item.toLowerCase()))
  const deps = new Set((request.dependencyNames ?? []).map((item) => item.toLowerCase()))
  const allowed = new Set(request.allowedLocalStatuses ?? ["KERNEL_VERIFIED"])

  const ranked: PremiseCandidate[] = []
  for (const declaration of declarations) {
    if (declaration.claimStatus && FORBIDDEN.has(declaration.claimStatus)) continue
    if (declaration.origin === "workspace" && declaration.claimStatus && !allowed.has(declaration.claimStatus)) {
      continue
    }

    const reasons: string[] = []
    let score = 0
    const nameLower = declaration.name.toLowerCase()
    const nameTokens = new Set(tokenize(declaration.name))
    const sigTokens = new Set(tokenize(declaration.signature))

    if (queryTokens.size && [...queryTokens].some((token) => nameLower === token || nameLower.endsWith(`.${token}`))) {
      score += 0.42
      reasons.push("exact symbol match")
    }
    const distinctive = ["card", "union", "finset", "subset", "disjoint"].filter((token) => queryTokens.has(token))
    if (distinctive.length >= 2 && distinctive.every((token) => nameLower.includes(token))) {
      score += 0.45
      reasons.push("multi-symbol name match")
    }
    const nameOverlap = jaccard(queryTokens, nameTokens)
    if (nameOverlap > 0) {
      score += 0.28 * nameOverlap
      reasons.push("token overlap")
    }
    const sigOverlap = jaccard(queryTokens, sigTokens)
    if (sigOverlap > 0) {
      score += 0.22 * sigOverlap
      reasons.push("signature overlaps current goal")
    }
    if (declaration.namespace && [...queryTokens].some((token) => declaration.namespace!.toLowerCase().includes(token))) {
      score += 0.08
      reasons.push("namespace/module relevance")
    }
    if (declaration.origin === "workspace" && score > 0) {
      score += 0.12
      reasons.push("local-project boost")
    }
    if (declaration.claimStatus === "KERNEL_VERIFIED" && score > 0) {
      score += 0.22
      reasons.push("KERNEL_VERIFIED local lemma")
    }
    if (boosts.has(nameLower) || (declaration.claimId && boosts.has(declaration.claimId.toLowerCase()))) {
      score += 0.18
      reasons.push("explicit local boost")
    }
    if ([...deps].some((dep) => nameLower.includes(dep) || declaration.claimId?.toLowerCase() === dep)) {
      score += 0.28
      reasons.push("dependency proximity")
    }
    if ([...unknown].some((id) => nameLower === id.toLowerCase() || nameLower.endsWith(`.${id.toLowerCase()}`))) {
      score += 0.35
      reasons.push("unknown identifier match")
    }
    if (declaration.unsafeForRelease) {
      score *= 0.4
      reasons.push("unsafe_for_release")
    }
    if (score <= 0) continue
    ranked.push({ declaration, score: Math.min(1, Number(score.toFixed(3))), reasons })
  }

  ranked.sort((a, b) => b.score - a.score || a.declaration.name.localeCompare(b.declaration.name))
  const limit = request.maxPremises ?? 20
  return ranked.slice(0, limit)
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const token of a) if (b.has(token)) inter += 1
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

import type { ProviderBillingClass, ProviderConnectionState } from "../catalog/types.ts"
import { evaluateBillingTransition, type BillingTransitionPolicy } from "./billing-guard.ts"

export type ModelRouteState = "PRIMARY" | "FALLBACK" | "QUOTA_EXHAUSTED" | "UNAVAILABLE"

export interface ModelRouteCandidate<T> {
  profileId: string
  value: T
  billingClass: ProviderBillingClass
  remote: boolean
  connectionState?: ProviderConnectionState
}

export interface ModelRouteDecision<T> {
  state: ModelRouteState
  selected: ModelRouteCandidate<T> | null
  rejected: Array<{ profileId: string; reason: string }>
}

const READY = new Set<ProviderConnectionState>(["CONFIGURED", "CONNECTED", "DEGRADED"])

export function selectFallbackRoute<T>(candidates: ModelRouteCandidate<T>[], policy: BillingTransitionPolicy): ModelRouteDecision<T> {
  const [primary] = candidates
  if (!primary) return { state: "UNAVAILABLE", selected: null, rejected: [] }
  const rejected: ModelRouteDecision<T>["rejected"] = []
  let quotaExhausted = false
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]!
    const state = candidate.connectionState ?? "CONNECTED"
    if (state === "QUOTA_EXHAUSTED") { quotaExhausted = true; rejected.push({ profileId: candidate.profileId, reason: state }); continue }
    if (!READY.has(state)) { rejected.push({ profileId: candidate.profileId, reason: state }); continue }
    if (index > 0) {
      const guard = evaluateBillingTransition(primary, candidate, policy)
      if (!guard.allowed) { rejected.push({ profileId: candidate.profileId, reason: guard.code }); continue }
    }
    return { state: index === 0 ? "PRIMARY" : "FALLBACK", selected: candidate, rejected }
  }
  return { state: quotaExhausted ? "QUOTA_EXHAUSTED" : "UNAVAILABLE", selected: null, rejected }
}

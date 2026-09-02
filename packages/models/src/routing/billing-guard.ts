import type { ProviderBillingClass } from "../catalog/types.ts"

export interface BillingTransitionPolicy {
  allowBillingTransition: boolean
  allowLocalToRemoteTransition: boolean
}

export interface BillingRouteIdentity {
  profileId: string
  billingClass: ProviderBillingClass
  remote: boolean
}

export type BillingGuardResult =
  | { allowed: true }
  | { allowed: false; code: "BILLING_TRANSITION_BLOCKED" | "LOCAL_TO_REMOTE_TRANSITION_BLOCKED" }

export function evaluateBillingTransition(from: BillingRouteIdentity, to: BillingRouteIdentity, policy: BillingTransitionPolicy): BillingGuardResult {
  if (!from.remote && to.remote && !policy.allowLocalToRemoteTransition) return { allowed: false, code: "LOCAL_TO_REMOTE_TRANSITION_BLOCKED" }
  if (from.billingClass !== to.billingClass && !policy.allowBillingTransition) return { allowed: false, code: "BILLING_TRANSITION_BLOCKED" }
  return { allowed: true }
}

export function assertBillingTransition(from: BillingRouteIdentity, to: BillingRouteIdentity, policy: BillingTransitionPolicy): void {
  const result = evaluateBillingTransition(from, to, policy)
  if (!result.allowed) throw new Error(`${result.code}: ${from.profileId} -> ${to.profileId}`)
}

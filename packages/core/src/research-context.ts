import type { Claim, ResearchRun, ResearchStep } from "@mathos/domain"
import type { ResearchContextView } from "./research-planner.ts"

export function buildResearchContext(input: {
  run: ResearchRun
  objective: Claim | null
  branchName: string
  claims: Claim[]
  blockers: Array<{ id: string; summary: string; type: string }>
  steps: ResearchStep[]
  lastFailure?: string
  fidelityBlocked?: boolean
  digestVerifiedFindings?: Array<{ claimId: string; branchId: string; title: string }>
  graph?: import("@mathos/graph").GraphContextSummary
  agenda?: Array<{ id: string; title: string; status: string }>
}): ResearchContextView {
  const claims = input.claims.slice(-12)
  return {
    objective: input.objective
      ? { id: input.objective.id, title: input.objective.title, status: input.objective.status, statement: input.objective.naturalStatement.slice(0, 400) }
      : { id: "none", title: "none", status: "IDEA", statement: "" },
    branch: { id: input.run.branchId, name: input.branchName },
    activeClaims: claims.filter((claim) => claim.status !== "KERNEL_VERIFIED").map((claim) => ({ id: claim.id, title: claim.title, status: claim.status })),
    verifiedClaims: claims.filter((claim) => claim.status === "KERNEL_VERIFIED").map((claim) => ({ id: claim.id, title: claim.title })),
    blockers: input.blockers.slice(0, 8),
    recentSteps: input.steps.slice(-8).map((step) => ({ sequence: step.sequence, action: step.action, status: step.status, summary: step.summary })),
    proofState: input.run.strategy.focusClaimId ? { claimId: input.run.strategy.focusClaimId, lastFailure: input.lastFailure } : undefined,
    budget: {
      steps: `${input.run.usage.steps}/${input.run.limits.maxSteps}`,
      proofs: `${input.run.usage.proofAttempts}/${input.run.limits.maxProofAttempts}`,
      model: `${input.run.usage.modelCalls}/${input.run.limits.maxModelCalls}`,
      lean: `${input.run.usage.leanCalls}/${input.run.limits.maxLeanCalls}`,
    },
    fidelityBlocked: input.fidelityBlocked,
    digestVerifiedFindings: input.digestVerifiedFindings ?? [],
    graph: input.graph,
    agenda: input.agenda?.slice(0, 5),
  }
}

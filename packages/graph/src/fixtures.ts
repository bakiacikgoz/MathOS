import type { Claim, ClaimStatus, Dependency, FormalStatement, ProofAttempt, ResearchBlockerRecord, VerificationRun } from "@mathos/domain"
import type { ResearchGraphSnapshot } from "./types.ts"

function claim(id: string, status: ClaimStatus, branchId = "B-000", title = id): Claim {
  return {
    id,
    workspaceId: "ws",
    kind: id.startsWith("T") ? "theorem" : "lemma",
    title,
    naturalStatement: title,
    originalInput: null,
    status,
    branchId,
    createdBy: "user",
    provider: null,
    modelName: null,
    createdAt: "t",
    updatedAt: "t",
  }
}

function dep(from: string, to: string, id: string): Dependency {
  return { id, workspaceId: "ws", fromClaimId: from, toClaimId: to, relation: "depends_on", createdAt: "t" }
}

export function canonicalGraphFixture(): ResearchGraphSnapshot {
  return {
    workspaceId: "ws",
    mainObjectiveId: "T-001",
    eventSequence: 12,
    builtAt: "t0",
    claims: [
      claim("T-001", "FORMALIZED_UNVERIFIED"),
      claim("L-001", "KERNEL_VERIFIED"),
      claim("L-002", "FORMALIZED_UNVERIFIED"),
      claim("L-003", "BLOCKED"),
    ],
    dependencies: [dep("T-001", "L-001", "d1"), dep("T-001", "L-002", "d2"), dep("T-001", "L-003", "d3"), dep("L-002", "L-003", "d4")],
    formals: [
      { id: "FS-001", workspaceId: "ws", claimId: "L-001", language: "lean4", declarationName: "L001", sourceText: "", filePath: null, isCurrent: true, verificationStatus: "VERIFIED", fidelityStatus: "HUMAN_APPROVED", createdBy: "user", provider: null, modelName: null, leanVersion: "4.33.1", createdAt: "t", updatedAt: "t" } satisfies FormalStatement,
    ],
    proofs: [
      { id: "PA-003", workspaceId: "ws", claimId: "L-002", formalStatementId: "FS-x", status: "FAILED", proofSource: "", attemptNumber: 1, provider: null, modelName: null, leanVersion: null, diagnostics: [{ severity: "error", message: "type mismatch" }], retrievalQuery: null, candidateNames: [], indexRevision: null, retrievalMode: null, retrievalProvenance: null, createdAt: "t" } satisfies ProofAttempt,
    ],
    verifications: [
      { id: "VR-011", workspaceId: "ws", formalStatementId: "FS-001", claimId: "L-001", proofAttemptId: null, result: "KERNEL_ACCEPTED", leanVersion: "4.33.1", toolchain: "v4.33.1", diagnosticsJson: "[]", axiomsJson: "[]", forbiddenJson: "[]", fidelityStatus: "HUMAN_APPROVED", gateJson: "{}", createdAt: "t" } satisfies VerificationRun,
    ],
    blockers: [
      { id: "BL-002", workspaceId: "ws", branchId: "B-000", claimId: "L-003", type: "MISSING_PREMISE", status: "OPEN", summary: "missing premise", createdByStepId: null, resolvedByStepId: null, humanResponse: null, resolvedByHumanAt: null, createdAt: "t" } satisfies ResearchBlockerRecord,
    ],
    decisions: [{ id: "DEC-001", runId: "R-001", branchId: "B-000", summary: "Switch to auxiliary lemma", createdAt: "t" }],
    runs: [],
    agents: [],
    branches: [],
    imports: [],
    visibility: ["T-001", "L-001", "L-002", "L-003"].map((id) => ({ branchId: "B-000", claimId: id, relation: "LOCAL" })),
  }
}

export function cycleGraphFixture(): ResearchGraphSnapshot {
  const base = canonicalGraphFixture()
  return {
    ...base,
    mainObjectiveId: "L-A",
    claims: [claim("L-A", "CONJECTURE"), claim("L-B", "CONJECTURE"), claim("L-C", "CONJECTURE")],
    dependencies: [dep("L-A", "L-B", "c1"), dep("L-B", "L-C", "c2"), dep("L-C", "L-A", "c3")],
    formals: [],
    proofs: [],
    verifications: [],
    blockers: [],
    visibility: ["L-A", "L-B", "L-C"].map((id) => ({ branchId: "B-000", claimId: id, relation: "LOCAL" })),
  }
}

export function branchIsolationFixture(): ResearchGraphSnapshot {
  return {
    workspaceId: "ws",
    mainObjectiveId: "T-001",
    eventSequence: 3,
    claims: [claim("T-001", "CONJECTURE", "B-000"), claim("L-001", "CONJECTURE", "B-000"), claim("L-010", "CONJECTURE", "B-004"), claim("L-020", "CONJECTURE", "B-005")],
    dependencies: [dep("T-001", "L-001", "d1")],
    formals: [],
    proofs: [],
    verifications: [],
    blockers: [],
    decisions: [],
    runs: [],
    agents: [],
    branches: [],
    imports: [],
    visibility: [
      { branchId: "B-000", claimId: "T-001", relation: "LOCAL" },
      { branchId: "B-000", claimId: "L-001", relation: "LOCAL" },
      { branchId: "B-004", claimId: "T-001", relation: "INHERITED" },
      { branchId: "B-004", claimId: "L-001", relation: "INHERITED" },
      { branchId: "B-004", claimId: "L-010", relation: "LOCAL" },
      { branchId: "B-005", claimId: "T-001", relation: "INHERITED" },
      { branchId: "B-005", claimId: "L-001", relation: "INHERITED" },
      { branchId: "B-005", claimId: "L-020", relation: "LOCAL" },
    ],
  }
}

export function importGraphFixture(): ResearchGraphSnapshot {
  return {
    workspaceId: "ws",
    mainObjectiveId: "T-001",
    eventSequence: 4,
    claims: [claim("T-001", "CONJECTURE"), claim("L-021", "KERNEL_VERIFIED", "B-005"), claim("L-044", "KERNEL_VERIFIED", "B-004")],
    dependencies: [],
    formals: [],
    proofs: [],
    verifications: [
      { id: "VR-SRC", workspaceId: "ws", formalStatementId: "FS-s", claimId: "L-021", proofAttemptId: null, result: "KERNEL_ACCEPTED", leanVersion: "4.33.1", toolchain: null, diagnosticsJson: "[]", axiomsJson: "[]", forbiddenJson: "[]", fidelityStatus: null, gateJson: "{}", createdAt: "t" },
      { id: "VR-TGT", workspaceId: "ws", formalStatementId: "FS-t", claimId: "L-044", proofAttemptId: null, result: "KERNEL_ACCEPTED", leanVersion: "4.33.1", toolchain: null, diagnosticsJson: "[]", axiomsJson: "[]", forbiddenJson: "[]", fidelityStatus: null, gateJson: "{}", createdAt: "t" },
    ],
    blockers: [],
    decisions: [],
    runs: [],
    agents: [],
    branches: [],
    imports: [{
      id: "IMP-001",
      sessionId: "MR-001",
      sourceAgentId: "A-002",
      sourceBranchId: "B-005",
      targetAgentId: "A-001",
      targetBranchId: "B-004",
      sourceClaimId: "L-021",
      targetClaimId: "L-044",
      sourceVerificationRunId: "VR-SRC",
      sourceFormalRevision: "FS-s",
      status: "APPLIED",
      failureCode: null,
      createdAt: "t",
      approvedAt: "t",
      appliedAt: "t",
    }],
    visibility: [
      { branchId: "B-004", claimId: "T-001", relation: "INHERITED" },
      { branchId: "B-004", claimId: "L-021", relation: "INHERITED" },
      { branchId: "B-004", claimId: "L-044", relation: "LOCAL" },
    ],
  }
}

export function syntheticGraphSnapshot(n = 1000): ResearchGraphSnapshot {
  const claims = Array.from({ length: n }, (_, i) => claim(`C-${String(i + 1).padStart(4, "0")}`, i % 7 === 0 ? "KERNEL_VERIFIED" : "CONJECTURE"))
  const dependencies: Dependency[] = []
  for (let i = 1; i < n; i += 1) {
    dependencies.push(dep(claims[i]!.id, claims[i - 1]!.id, `d${i}`))
    if (i > 2) dependencies.push(dep(claims[i]!.id, claims[i - 2]!.id, `e${i}`))
  }
  return {
    workspaceId: "ws",
    mainObjectiveId: claims[n - 1]!.id,
    eventSequence: n,
    claims,
    dependencies,
    formals: [],
    proofs: [],
    verifications: [],
    blockers: [],
    decisions: [],
    runs: [],
    agents: [],
    branches: [],
    imports: [],
    visibility: claims.map((item) => ({ branchId: "B-000", claimId: item.id, relation: "LOCAL" })),
  }
}

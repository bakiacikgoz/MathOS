import type { Claim, FormalStatement, GateCheck, ProofAttempt, VerificationReport } from "@mathos/domain"
import { scanForbidden } from "@mathos/domain"

const STANDARD_AXIOMS = new Set([
  "propext",
  "Quot.sound",
  "Classical.choice",
  "funext",
  "Eq.rec",
  "rfl",
])

export function runVerificationGate(input: {
  claim: Claim
  formal: FormalStatement
  proof: ProofAttempt | null
  axioms: string[]
  leanVersion: string | null
  toolchain: string | null
  compiled: boolean
  currentRevision: boolean
}): VerificationReport {
  const forbidden = input.proof ? scanForbidden(input.proof.proofSource) : ["missing proof"]
  const customAxioms = input.axioms.filter((name) => !STANDARD_AXIOMS.has(name) && !name.startsWith("Lean."))
  const checks: GateCheck[] = [
    {
      name: "current revision",
      status: input.currentRevision ? "PASS" : "FAIL",
      detail: input.currentRevision ? input.formal.id : "formal statement is not current",
    },
    {
      name: "fidelity",
      status: input.formal.fidelityStatus === "HUMAN_APPROVED" ? "PASS" : "FAIL",
      detail: input.formal.fidelityStatus,
    },
    {
      name: "proof compiles",
      status: input.compiled && input.proof?.status === "KERNEL_ACCEPTED" ? "PASS" : "FAIL",
      detail: input.proof?.status ?? "no proof",
    },
    {
      name: "forbidden constructs",
      status: forbidden.length === 0 ? "PASS" : "FAIL",
      detail: forbidden.length ? forbidden.join(", ") : "none",
    },
    {
      name: "custom axioms",
      status: customAxioms.length === 0 ? "PASS" : "FAIL",
      detail: customAxioms.length ? customAxioms.join(", ") : "none",
    },
    {
      name: "Lean version",
      status: input.leanVersion ? "PASS" : "FAIL",
      detail: input.leanVersion ?? "missing",
    },
    {
      name: "toolchain pinned",
      status: input.toolchain && !/^(stable|latest)$/i.test(input.toolchain) ? "PASS" : "FAIL",
      detail: input.toolchain ?? "missing",
    },
  ]
  const passed = checks.every((check) => check.status === "PASS")
  return {
    claimId: input.claim.id,
    formalStatementId: input.formal.id,
    proofAttemptId: input.proof?.id ?? null,
    passed,
    claimStatus: passed ? "KERNEL_VERIFIED" : input.claim.status,
    checks,
    axioms: input.axioms,
    customAxioms,
    leanVersion: input.leanVersion,
    toolchain: input.toolchain,
  }
}

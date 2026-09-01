import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { scanForbidden, type VerificationReport } from "@mathos/domain"
import type { LeanAdapter, LeanContext } from "@mathos/lean"
import {
  ClaimRepository,
  FormalStatementRepository,
  ProofAttemptRepository,
  VerificationRunRepository,
  WorkspaceRepository,
} from "@mathos/storage"
import { ClaimNotFound, FormalStatementNotFound, createId, nowIso } from "@mathos/shared"
import { runVerificationGate } from "../verify.ts"

type VerificationEvent = {
  target?: string | null
  metadata?: Record<string, unknown>
}

interface VerificationServiceDependencies {
  root: string
  workspaces: WorkspaceRepository
  claims: ClaimRepository
  formalStatements: FormalStatementRepository
  verificationRuns: VerificationRunRepository
  proofs: ProofAttemptRepository
  leanAdapter: LeanAdapter
  leanContext: () => LeanContext
  consumeLeanBudget: (reason: "VERIFICATION" | "AXIOM_AUDIT") => boolean
  recordEvent: (action: string, event: VerificationEvent) => void
}

export class VerificationService {
  constructor(private readonly dependencies: VerificationServiceDependencies) {}

  async verify(claimId: string): Promise<VerificationReport> {
    const workspace = this.dependencies.workspaces.get()
    if (!workspace) throw new Error("Workspace row is missing after open")

    const claim = this.dependencies.claims.get(claimId.trim().toUpperCase())
    if (!claim) throw new ClaimNotFound(claimId)
    const formal = this.dependencies.formalStatements.currentForClaim(claim.id)
    if (!formal) throw new FormalStatementNotFound(claim.id)
    const proof = this.dependencies.proofs.latestAccepted(claim.id)
    this.dependencies.recordEvent("verification_started", {
      target: claim.id,
      metadata: { formal_id: formal.id, proof_id: proof?.id ?? null },
    })

    if (proof && !this.dependencies.consumeLeanBudget("VERIFICATION")) {
      throw new Error("LEAN_CALL_BUDGET_EXHAUSTED")
    }
    const context = this.dependencies.leanContext()
    const compiled = proof
      ? (await this.dependencies.leanAdapter.checkProof(proof.proofSource, context)).result === "KERNEL_ACCEPTED"
      : false

    if (proof && !this.dependencies.consumeLeanBudget("AXIOM_AUDIT")) {
      throw new Error("LEAN_CALL_BUDGET_EXHAUSTED")
    }
    const axioms = proof
      ? await this.dependencies.leanAdapter.printAxioms(formal.declarationName, proof.proofSource, this.dependencies.leanContext())
      : []
    const environment = await this.dependencies.leanAdapter.detect(this.dependencies.leanContext().workspaceRoot)
    const report = runVerificationGate({
      claim,
      formal,
      proof,
      axioms,
      leanVersion: environment.leanVersion,
      toolchain: environment.toolchain,
      compiled,
      currentRevision: formal.isCurrent,
    })

    this.dependencies.verificationRuns.insert({
      id: createId("vr"),
      workspaceId: workspace.id,
      formalStatementId: formal.id,
      claimId: claim.id,
      proofAttemptId: proof?.id ?? null,
      result: report.passed ? "KERNEL_ACCEPTED" : "FAILED",
      leanVersion: environment.leanVersion,
      toolchain: environment.toolchain,
      diagnosticsJson: "[]",
      axiomsJson: JSON.stringify(axioms),
      forbiddenJson: JSON.stringify(proof ? scanForbidden(proof.proofSource) : []),
      fidelityStatus: formal.fidelityStatus,
      gateJson: JSON.stringify(report.checks),
      createdAt: nowIso(),
    })

    if (report.passed) {
      this.dependencies.claims.updateStatus(claim.id, "KERNEL_VERIFIED", nowIso())
      writeProofFile(this.dependencies.root, claim.id, proof!.proofSource)
      this.dependencies.recordEvent("verification_passed", {
        target: claim.id,
        metadata: { formal_id: formal.id, proof_id: proof?.id },
      })
      this.dependencies.recordEvent("claim_kernel_verified", {
        target: claim.id,
        metadata: { formal_id: formal.id },
      })
    } else {
      this.dependencies.recordEvent("verification_failed", {
        target: claim.id,
        metadata: { reasons: report.checks.filter((check) => check.status === "FAIL").map((check) => check.name) },
      })
    }

    return {
      ...report,
      claimStatus: report.passed ? "KERNEL_VERIFIED" : this.dependencies.claims.get(claim.id)?.status ?? claim.status,
    }
  }
}

function writeProofFile(root: string, claimId: string, source: string): string | null {
  const dir = join(root, "formal", "Claims")
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${claimId.replace("-", "")}.lean`)
  const tmp = `${file}.tmp`
  if (existsSync(file)) {
    const existing = readFileSync(file, "utf8")
    if (existing.includes(":= by") && !existing.includes(source.slice(0, 40))) return null
  }
  writeFileSync(tmp, `${source.trim()}\n`, "utf8")
  renameSync(tmp, file)
  return `formal/Claims/${claimId.replace("-", "")}.lean`
}

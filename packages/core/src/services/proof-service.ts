import {
  composeProof,
  declarationsMatch,
  scanForbidden,
  type ProofAttempt,
  type ProofSession,
  type VerificationReport,
} from "@mathos/domain"
import type { LeanAdapter, LeanContext } from "@mathos/lean"
import type { ModelProvider } from "@mathos/models"
import {
  ClaimRepository,
  FormalStatementRepository,
  ProofAttemptRepository,
  WorkspaceRepository,
} from "@mathos/storage"
import { ClaimNotFound, FormalStatementNotFound, ProofAttemptFailed, ProofPrerequisiteFailed, nowIso } from "@mathos/shared"
import { parseProofBody, PROVE_SYSTEM_PROMPT } from "../prove.ts"
import type { MutationEvent, MutationRecorder } from "../mutation-recorder.ts"
import { RetrievalService } from "./retrieval-service.ts"

export interface ProveOptions {
  maxAttempts?: number
  proofBody?: string
  skipInspect?: boolean
  skipVerify?: boolean
}

export interface ProofServiceDependencies {
  workspaces: WorkspaceRepository
  claims: ClaimRepository
  formalStatements: FormalStatementRepository
  proofs: ProofAttemptRepository
  modelProvider: ModelProvider
  leanAdapter: LeanAdapter
  retrieval: RetrievalService
  leanContext: () => LeanContext
  hasActiveAccounting: () => boolean
  consumeLeanBudget: (reason: "PROOF_COMPILE") => boolean
  crashBoundary: () => string | null
  allocateId: (prefix: string) => string
  verify: (claimId: string) => Promise<VerificationReport>
  recorder: MutationRecorder
}

export class ProofService {
  constructor(private readonly d: ProofServiceDependencies) {}

  list(claimId: string): ProofAttempt[] {
    return this.d.proofs.listForClaim(this.getClaim(claimId).id)
  }

  async prove(claimId: string, signal?: AbortSignal, options?: ProveOptions): Promise<ProofSession> {
    const workspace = this.requireWorkspace()
    const claim = this.getClaim(claimId)
    const formal = this.d.formalStatements.currentForClaim(claim.id)
    if (!formal) throw new FormalStatementNotFound(claim.id)
    if (formal.verificationStatus !== "ELABORATES") throw new ProofPrerequisiteFailed("Formal statement must elaborate before /prove.")
    if (formal.fidelityStatus === "REJECTED") throw new ProofPrerequisiteFailed("Rejected fidelity cannot be proved.")
    if ((claim.kind === "theorem" || claim.kind === "corollary") && formal.fidelityStatus !== "HUMAN_APPROVED") {
      throw new ProofPrerequisiteFailed("Theorems require HUMAN_APPROVED fidelity before /prove.")
    }

    this.d.recorder.record("proof_attempt_started", { target: claim.id, metadata: { formal_id: formal.id } })
    const attempts: ProofAttempt[] = []
    let previous = ""
    let lastDiagnostics = ""
    let lastRetrieval: ProofSession["retrieval"] = null

    for (let n = 1; n <= (options?.maxAttempts ?? 3); n += 1) {
      if (signal?.aborted) throw new ProofAttemptFailed("Proof attempt cancelled.")
      const retrieval = await this.d.retrieval.forProof({
        claim,
        formal,
        diagnostics: lastDiagnostics,
        attempt: n,
        previousNames: attempts.flatMap((item) => item.candidateNames),
        skipInspect: options?.skipInspect,
      })
      const retrieved = retrieval.result
      lastRetrieval = retrieval.summary
      const body = options?.proofBody ?? await this.d.modelProvider.generateStructured({
        schemaName: "proof_body",
        signal,
        messages: [
          { role: "system", content: PROVE_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              `Claim ${claim.id}: ${claim.title}`,
              `NATURAL:\n${claim.naturalStatement}`,
              `FORMAL:\n${formal.sourceText}`,
              retrieval.context,
              previous ? `PREVIOUS PROOF:\n${previous}` : "",
              lastDiagnostics ? `LEAN DIAGNOSTICS:\n${lastDiagnostics}` : "",
              "Return only a proof body. Do not change the statement.",
            ].filter(Boolean).join("\n\n"),
          },
        ],
        parse: parseProofBody,
      })
      const source = composeProof(formal.sourceText, body)
      const names = retrieved.candidates.map((item) => item.declaration.name)
      const provenance: ProofAttempt["retrievalProvenance"] = {
        inspectSelectionStrategy: retrieved.inspectSelectionStrategy ?? null,
        inspectSelectorVersion: retrieved.inspectSelectorVersion ?? null,
        inspectionLimit: retrieved.inspectionLimit ?? null,
        inspectedCandidates: retrieved.inspectedCandidates ?? [],
        selectionReasons: retrieved.selectionReasons ?? {},
        fusionMethod: retrieved.fusionMethod ?? null,
      }
      if (!declarationsMatch(formal.sourceText, source)) {
        const failed = this.persistAttempt("proof_attempt_failed", { metadata: { reason: "statement_mutated", n } }, workspace.id, claim.id, formal.id, n, source, "FAILED", formal.leanVersion, [
          { severity: "error", message: "Proof mutated the formal statement." },
        ], retrieved.query, names, retrieved.indexRevision, retrieved.mode, provenance)
        attempts.push(failed)
        continue
      }
      const forbidden = scanForbidden(source)
      if (forbidden.length) {
        const failed = this.persistAttempt("proof_attempt_failed", { metadata: { reason: "forbidden", n } }, workspace.id, claim.id, formal.id, n, source, "FAILED", formal.leanVersion, [
          { severity: "error", message: `Forbidden constructs: ${forbidden.join(", ")}` },
        ], retrieved.query, names, retrieved.indexRevision, retrieved.mode, provenance)
        attempts.push(failed)
        previous = source
        lastDiagnostics = forbidden.join(", ")
        continue
      }

      if (!this.d.consumeLeanBudget("PROOF_COMPILE")) throw new Error("LEAN_CALL_BUDGET_EXHAUSTED")
      if (this.d.crashBoundary() === "after_tool_start") throw new Error("crash")
      const leanContext = this.d.leanContext()
      const checked = await this.d.leanAdapter.checkProof(source, {
        workspaceRoot: leanContext.workspaceRoot,
        tmpDir: leanContext.tmpDir,
        signal: leanContext.signal ?? signal,
      })
      if (this.d.crashBoundary() === "after_result") throw new Error("crash")
      if (checked.result === "KERNEL_ACCEPTED") {
        const accepted = this.persistAttempt("proof_attempt_accepted", {
          metadata: { claim_id: claim.id, formal_id: formal.id, n, lean: checked.leanVersion, premises: names.slice(0, 8) },
        }, workspace.id, claim.id, formal.id, n, source, "KERNEL_ACCEPTED", checked.leanVersion, checked.diagnostics, retrieved.query, names, retrieved.indexRevision, retrieved.mode, provenance)
        attempts.push(accepted)
        const verification = options?.skipVerify || this.d.hasActiveAccounting() ? null : await this.d.verify(claim.id)
        return { claimId: claim.id, formalStatement: formal, attempts, accepted, verification, proofAttempted: true, retrieval: lastRetrieval }
      }

      const failed = this.persistAttempt("proof_attempt_failed", { metadata: { n } }, workspace.id, claim.id, formal.id, n, source, "FAILED", checked.leanVersion, checked.diagnostics, retrieved.query, names, retrieved.indexRevision, retrieved.mode, provenance)
      attempts.push(failed)
      previous = source
      lastDiagnostics = checked.diagnostics.map((item) => item.message).join("\n")
    }

    return { claimId: claim.id, formalStatement: formal, attempts, accepted: null, verification: null, proofAttempted: true, retrieval: lastRetrieval }
  }

  storeAttempt(
    workspaceId: string,
    claimId: string,
    formalId: string,
    attemptNumber: number,
    proofSource: string,
    status: ProofAttempt["status"],
    leanVersion: string | null,
    diagnostics: ProofAttempt["diagnostics"],
    retrievalQuery: string | null = null,
    candidateNames: string[] = [],
    indexRevision: string | null = null,
    retrievalMode: string | null = null,
    retrievalProvenance: ProofAttempt["retrievalProvenance"] = null,
  ): ProofAttempt {
    const attempt: ProofAttempt = {
      id: this.d.allocateId("PA"),
      workspaceId,
      claimId,
      formalStatementId: formalId,
      status,
      proofSource,
      attemptNumber,
      provider: this.d.modelProvider.id,
      modelName: this.d.modelProvider.model,
      leanVersion,
      diagnostics,
      retrievalQuery,
      candidateNames,
      indexRevision,
      retrievalMode,
      retrievalProvenance,
      createdAt: nowIso(),
    }
    return this.d.recorder.mutate("proof_attempt_recorded", { target: attempt.id, metadata: { claim_id: claimId, formal_id: formalId, attemptNumber, status } }, () => {
      this.d.proofs.insert(attempt)
      return attempt
    })
  }

  private persistAttempt(
    action: string,
    event: MutationEvent,
    workspaceId: string,
    claimId: string,
    formalId: string,
    attemptNumber: number,
    proofSource: string,
    status: ProofAttempt["status"],
    leanVersion: string | null,
    diagnostics: ProofAttempt["diagnostics"],
    retrievalQuery: string | null = null,
    candidateNames: string[] = [],
    indexRevision: string | null = null,
    retrievalMode: string | null = null,
    retrievalProvenance: ProofAttempt["retrievalProvenance"] = null,
  ): ProofAttempt {
    const attempt: ProofAttempt = {
      id: this.d.allocateId("PA"), workspaceId, claimId, formalStatementId: formalId, status, proofSource,
      attemptNumber, provider: this.d.modelProvider.id, modelName: this.d.modelProvider.model, leanVersion,
      diagnostics, retrievalQuery, candidateNames, indexRevision, retrievalMode, retrievalProvenance, createdAt: nowIso(),
    }
    return this.d.recorder.mutate(action, { ...event, target: attempt.id }, () => {
      this.d.proofs.insert(attempt)
      return attempt
    })
  }

  private getClaim(id: string) {
    const claim = this.d.claims.get(id.trim().toUpperCase())
    if (!claim) throw new ClaimNotFound(id)
    return claim
  }

  private requireWorkspace() {
    const workspace = this.d.workspaces.get()
    if (!workspace) throw new Error("Workspace row is missing after open")
    return workspace
  }
}

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { FidelityReview, FormalizationSession, FormalStatement } from "@mathos/domain"
import { nextSequentialId } from "@mathos/domain"
import type { LeanAdapter, LeanContext } from "@mathos/lean"
import type { ModelProvider } from "@mathos/models"
import {
  ClaimRepository,
  FidelityReviewRepository,
  FormalStatementRepository,
  VerificationRunRepository,
  WorkspaceRepository,
} from "@mathos/storage"
import {
  ClaimNotFound,
  FormalizationFailed,
  FormalStatementNotFound,
  createId,
  nowIso,
} from "@mathos/shared"
import { reviewFidelity } from "../fidelity.ts"
import { draftFormalization } from "../formalize.ts"
import type { MutationRecorder } from "../mutation-recorder.ts"

interface FormalizationServiceDependencies {
  root: string
  workspaces: WorkspaceRepository
  claims: ClaimRepository
  formalStatements: FormalStatementRepository
  fidelityReviews: FidelityReviewRepository
  verificationRuns: VerificationRunRepository
  modelProvider: ModelProvider
  auditorProvider: ModelProvider
  leanAdapter: LeanAdapter
  leanContext: () => LeanContext
  recorder: MutationRecorder
}

export class FormalizationService {
  constructor(private readonly dependencies: FormalizationServiceDependencies) {}

  async formalize(claimId: string): Promise<FormalizationSession> {
    const workspace = this.requireWorkspace()
    const claim = this.requireClaim(claimId)
    let draft = await draftFormalization(this.dependencies.modelProvider, claim)
    this.dependencies.recorder.record("formalization_drafted", {
      target: claim.id,
      metadata: { declaration: draft.declarationName, provider: draft.modelProvenance.provider },
    })

    let repairs = 0
    let check = await this.dependencies.leanAdapter.checkStatement(draft.leanStatement, this.statementContext())
    while (check.result !== "ELABORATES" && repairs < 2) {
      repairs += 1
      draft = await draftFormalization(this.dependencies.modelProvider, claim, {
        previous: draft.leanStatement,
        diagnostics: check.diagnostics.map((item) => item.message).join("\n"),
      })
      check = await this.dependencies.leanAdapter.checkStatement(draft.leanStatement, this.statementContext())
    }
    if (check.result !== "ELABORATES") {
      throw new FormalizationFailed("FORMALIZATION_FAILED: Lean statement did not elaborate after 2 repairs.")
    }

    const timestamp = nowIso()
    const id = nextSequentialId(this.dependencies.formalStatements.ids(workspace.id), "FS")
    const statement: FormalStatement = {
      id,
      workspaceId: workspace.id,
      claimId: claim.id,
      language: "lean4",
      declarationName: draft.declarationName,
      sourceText: draft.leanStatement,
      filePath: null,
      isCurrent: true,
      verificationStatus: "ELABORATES",
      fidelityStatus: "AI_REVIEWED",
      createdBy: "model",
      provider: draft.modelProvenance.provider,
      modelName: draft.modelProvenance.model,
      leanVersion: check.leanVersion,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const verificationRun: Parameters<VerificationRunRepository["insert"]>[0] = {
      id: createId("vr"),
      workspaceId: workspace.id,
      formalStatementId: statement.id,
      claimId: claim.id,
      proofAttemptId: null,
      result: "ELABORATES",
      leanVersion: check.leanVersion,
      toolchain: check.toolchain,
      diagnosticsJson: JSON.stringify(check.diagnostics),
      axiomsJson: "[]",
      forbiddenJson: "[]",
      fidelityStatus: statement.fidelityStatus,
      gateJson: "[]",
      createdAt: timestamp,
    }
    this.dependencies.recorder.mutate("formal_statement_created", {
      target: statement.id,
      metadata: { claim_id: claim.id, declaration: statement.declarationName, lean: check.leanVersion },
    }, () => {
      this.dependencies.formalStatements.markOthersNotCurrent(claim.id)
      this.dependencies.formalStatements.insert(statement)
      this.dependencies.verificationRuns.insert(verificationRun)
    })
    this.dependencies.recorder.record("formal_statement_checked", {
      target: statement.id,
      metadata: { result: "ELABORATES", repairs },
    })

    const reviewed = await reviewFidelity(this.dependencies.auditorProvider, {
      claimId: claim.id,
      naturalStatement: claim.naturalStatement,
      leanStatement: statement.sourceText,
    })
    const fidelity: FidelityReview = {
      ...reviewed,
      id: createId("fr"),
      workspaceId: workspace.id,
      formalStatementId: statement.id,
      createdAt: timestamp,
    }
    this.dependencies.recorder.mutate("fidelity_review_completed", {
      target: statement.id,
      metadata: { verdict: fidelity.verdict, provider: fidelity.provider },
    }, () => {
      this.dependencies.fidelityReviews.insert(fidelity)
    })

    if (claim.status === "KERNEL_VERIFIED") {
      throw new FormalizationFailed("Refusing to treat elaboration as kernel verification.")
    }

    return {
      claimId: claim.id,
      formalStatement: statement,
      check: { result: check.result, diagnostics: check.diagnostics, repairs },
      fidelity,
      proofAttempted: false,
    }
  }

  getFormal(claimId: string): FormalStatement {
    const statement = this.dependencies.formalStatements.currentForClaim(this.requireClaim(claimId).id)
    if (!statement) throw new FormalStatementNotFound(claimId)
    return statement
  }

  getFidelity(formalId: string): FidelityReview | null {
    return this.dependencies.fidelityReviews.latestForFormal(formalId)
  }

  approveFormal(formalId: string): FormalStatement {
    const statement = this.dependencies.formalStatements.get(formalId)
    if (!statement) throw new FormalStatementNotFound(formalId)
    const claim = this.requireClaim(statement.claimId)
    if (statement.verificationStatus !== "ELABORATES") {
      throw new FormalizationFailed("Cannot approve a statement that does not elaborate.")
    }
    const timestamp = nowIso()
    const filePath = maybeWriteFormalFile(this.dependencies.root, claim.id, statement.sourceText)
    this.dependencies.recorder.mutate("fidelity_approved", { target: statement.id, metadata: { claim_id: claim.id } }, () => {
      this.dependencies.formalStatements.updateStatuses(statement.id, "ELABORATES", "HUMAN_APPROVED", timestamp, filePath)
      if (claim.status !== "KERNEL_VERIFIED" && claim.status !== "INDEPENDENTLY_CHECKED") {
        this.dependencies.claims.updateStatus(claim.id, "FORMALIZED_UNVERIFIED", timestamp)
      }
    })
    return this.dependencies.formalStatements.get(statement.id)!
  }

  rejectFormal(formalId: string): FormalStatement {
    const statement = this.dependencies.formalStatements.get(formalId)
    if (!statement) throw new FormalStatementNotFound(formalId)
    this.dependencies.recorder.mutate("fidelity_rejected", { target: statement.id, metadata: { claim_id: statement.claimId } }, () => {
      this.dependencies.formalStatements.updateStatuses(statement.id, statement.verificationStatus, "REJECTED", nowIso())
    })
    return this.dependencies.formalStatements.get(statement.id)!
  }

  formalSetup() {
    return this.dependencies.leanAdapter.setupProject(this.dependencies.root)
  }

  private requireWorkspace() {
    const workspace = this.dependencies.workspaces.get()
    if (!workspace) throw new Error("Workspace row is missing after open")
    return workspace
  }

  private requireClaim(claimId: string) {
    const claim = this.dependencies.claims.get(claimId.trim().toUpperCase())
    if (!claim) throw new ClaimNotFound(claimId)
    return claim
  }

  private statementContext(): LeanContext {
    const context = this.dependencies.leanContext()
    return { workspaceRoot: context.workspaceRoot, tmpDir: context.tmpDir }
  }
}

function maybeWriteFormalFile(root: string, claimId: string, source: string): string | null {
  const dir = join(root, "formal", "Claims")
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${claimId.replace("-", "")}.lean`)
  if (existsSync(file)) return null
  writeFileSync(file, `${source.trim()}\n`, "utf8")
  return `formal/Claims/${claimId.replace("-", "")}.lean`
}

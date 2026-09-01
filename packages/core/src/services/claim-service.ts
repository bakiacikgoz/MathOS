import type {
  Blocker,
  Claim,
  ClaimDetail,
  ClaimKind,
  ClaimStatus,
  Dependency,
  DependencyRelation,
  Evidence,
  EvidenceKind,
  ResearchDraft,
} from "@mathos/domain"
import {
  claimPrefix,
  defaultStatusForKind,
  isClaimStatus,
  validateClaimDraft,
} from "@mathos/domain"
import type { ModelProvider } from "@mathos/models"
import {
  BlockerRepository,
  BranchRepository,
  ClaimRepository,
  ClaimVisibilityRepository,
  DatabaseClient,
  DependencyRepository,
  EvidenceRepository,
  WorkspaceRepository,
} from "@mathos/storage"
import { ClaimNotFound, InvalidClaimStatus, createId, nowIso, type Logger } from "@mathos/shared"
import { runResearchIntake } from "../intake.ts"

type ClaimEvent = {
  target?: string | null
  metadata?: Record<string, unknown>
}

export interface ClaimServiceDependencies {
  client: DatabaseClient
  workspaces: WorkspaceRepository
  claims: ClaimRepository
  dependencies: DependencyRepository
  evidence: EvidenceRepository
  branches: BranchRepository
  blockers: BlockerRepository
  visibility: ClaimVisibilityRepository
  modelProvider: ModelProvider
  logger: Logger
  allocateId: (prefix: string) => string
  recordEvent: (action: string, event: ClaimEvent) => void
}

export interface CreateClaimInput {
  kind: ClaimKind | string
  title: string
  naturalStatement?: string
  statement?: string
  status?: ClaimStatus | string
  asMainObjective?: boolean
  originalInput?: string | null
  createdBy?: "user" | "model"
  provider?: string | null
  modelName?: string | null
}

export interface AddEvidenceInput {
  claimId: string
  kind: EvidenceKind
  summary: string
  artifactRef?: string | null
  reproducible?: boolean
}

export interface AddBlockerInput {
  title: string
  description?: string
  targetClaimId?: string | null
  priority?: Blocker["priority"]
}

export class ClaimService {
  constructor(private readonly d: ClaimServiceDependencies) {}

  ingest(text: string, signal?: AbortSignal) {
    return runResearchIntake(this.d.modelProvider, text, signal)
  }

  confirmIntake(draft: ResearchDraft, options: { asMainObjective?: boolean } = {}) {
    return this.create({
      kind: draft.kind,
      title: draft.title,
      statement: draft.normalizedStatement,
      status: draft.suggestedStatus,
      originalInput: draft.originalInput,
      createdBy: "model",
      provider: draft.modelProvenance.provider,
      modelName: draft.modelProvenance.model,
      asMainObjective: options.asMainObjective,
    })
  }

  create(input: CreateClaimInput): Claim {
    const draft = validateClaimDraft({
      kind: input.kind,
      title: input.title,
      statement: input.statement ?? input.naturalStatement ?? "",
    })
    const requestedStatus = input.status ?? defaultStatusForKind(draft.kind)
    if (!isClaimStatus(String(requestedStatus))) throw new InvalidClaimStatus(String(requestedStatus))
    const status = requestedStatus as ClaimStatus

    const workspace = this.requireWorkspace()
    const branch = this.d.branches.current(workspace.id)
    if (!branch) throw new Error("Current branch is missing")

    const id = this.d.allocateId(claimPrefix(draft.kind))
    const timestamp = nowIso()
    const claim: Claim = {
      id,
      workspaceId: workspace.id,
      kind: draft.kind,
      title: draft.title,
      naturalStatement: draft.statement,
      originalInput: input.originalInput ?? null,
      status,
      branchId: branch.id,
      createdBy: input.createdBy ?? "user",
      provider: input.provider ?? null,
      modelName: input.modelName ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    const persist = this.d.client.db.transaction(() => {
      this.d.claims.insert(claim)
      this.d.visibility.insert(branch.id, claim.id, "LOCAL", timestamp)
      if (input.asMainObjective) this.d.workspaces.setMainObjective(workspace.id, claim.id, timestamp)
    })
    persist()

    this.d.recordEvent("claim_created", {
      target: claim.id,
      metadata: {
        claim_id: claim.id,
        claim_type: claim.kind,
        title: claim.title,
        status: claim.status,
        branch: branch.id,
        branch_name: branch.name,
        created_by: claim.createdBy,
        provider: claim.provider,
        model: claim.modelName,
      },
    })
    if (input.asMainObjective) {
      this.d.recordEvent("main_objective_changed", {
        target: claim.id,
        metadata: { previous: workspace.mainObjectiveId, claim_id: claim.id },
      })
    }
    this.d.logger.info("claim created", { id: claim.id, kind: claim.kind })
    return claim
  }

  list(): Claim[] {
    const workspace = this.requireWorkspace()
    const branch = this.d.branches.current(workspace.id)
    if (!branch) throw new Error("Current branch is missing")
    const visible = this.d.claims.listVisible(branch.id)
    return visible.length ? visible : this.d.claims.list(workspace.id).filter((claim) => claim.branchId === branch.id)
  }

  get(id: string): Claim {
    const claim = this.d.claims.get(id.trim().toUpperCase())
    if (!claim) throw new ClaimNotFound(id)
    return claim
  }

  detail(id: string): ClaimDetail {
    const workspace = this.requireWorkspace()
    const claim = this.get(id)
    const branch = this.d.branches.get(claim.branchId)
    return {
      id: claim.id,
      kind: claim.kind,
      title: claim.title,
      status: claim.status,
      naturalStatement: claim.naturalStatement,
      branchName: branch?.name ?? "unknown",
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt,
      evidence: this.d.evidence.listForClaim(workspace.id, claim.id).map((item) => ({
        id: item.id,
        kind: item.kind,
        summary: item.summary,
      })),
      dependencies: this.d.dependencies.listForClaim(workspace.id, claim.id).map((item) => ({
        id: item.id,
        relation: item.relation,
        fromClaimId: item.fromClaimId,
        toClaimId: item.toClaimId,
      })),
    }
  }

  setMainObjective(claimId: string): Claim {
    const workspace = this.requireWorkspace()
    const claim = this.get(claimId)
    const previous = workspace.mainObjectiveId
    this.d.workspaces.setMainObjective(workspace.id, claim.id, nowIso())
    this.d.recordEvent("main_objective_changed", {
      target: claim.id,
      metadata: { previous, claim_id: claim.id, title: claim.title },
    })
    return claim
  }

  addDependency(fromClaimId: string, toClaimId: string, relation: DependencyRelation = "depends_on"): Dependency {
    const workspace = this.requireWorkspace()
    if (!this.d.claims.get(fromClaimId)) throw new ClaimNotFound(fromClaimId)
    if (!this.d.claims.get(toClaimId)) throw new ClaimNotFound(toClaimId)
    const dependency: Dependency = {
      id: createId("dep"),
      workspaceId: workspace.id,
      fromClaimId,
      toClaimId,
      relation,
      createdAt: nowIso(),
    }
    this.d.dependencies.insert(dependency)
    this.d.recordEvent("dependency_created", {
      target: dependency.id,
      metadata: { from: fromClaimId, to: toClaimId, relation },
    })
    return dependency
  }

  addEvidence(input: AddEvidenceInput): Evidence {
    const workspace = this.requireWorkspace()
    if (!this.d.claims.get(input.claimId)) throw new ClaimNotFound(input.claimId)
    const evidence: Evidence = {
      id: createId("ev"),
      workspaceId: workspace.id,
      claimId: input.claimId,
      kind: input.kind,
      summary: input.summary,
      artifactRef: input.artifactRef ?? null,
      reproducible: input.reproducible ?? false,
      createdAt: nowIso(),
    }
    this.d.evidence.insert(evidence)
    this.d.recordEvent("evidence_created", {
      target: evidence.id,
      metadata: { claimId: input.claimId, kind: input.kind },
    })
    return evidence
  }

  addBlocker(input: AddBlockerInput): Blocker {
    const workspace = this.requireWorkspace()
    if (input.targetClaimId && !this.d.claims.get(input.targetClaimId)) throw new ClaimNotFound(input.targetClaimId)
    const blocker: Blocker = {
      id: createId("blk"),
      workspaceId: workspace.id,
      targetClaimId: input.targetClaimId ?? null,
      title: input.title,
      description: input.description ?? "",
      priority: input.priority ?? "normal",
      status: "open",
      createdAt: nowIso(),
      resolvedAt: null,
    }
    this.d.blockers.insert(blocker)
    this.d.recordEvent("blocker_created", { target: blocker.id, metadata: { title: blocker.title } })
    return blocker
  }

  private requireWorkspace() {
    const workspace = this.d.workspaces.get()
    if (!workspace) throw new Error("Workspace row is missing after open")
    return workspace
  }
}

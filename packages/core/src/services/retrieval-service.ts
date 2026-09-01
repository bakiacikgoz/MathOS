import type { Claim, FormalStatement, ProofAttempt, ProofSession } from "@mathos/domain"
import type { LeanAdapter } from "@mathos/lean"
import {
  buildProofContext,
  extractUnknownIdentifiers,
  HybridPremiseRetriever,
  resolveRetrievalConfig,
  writeRetrievalLog,
  type IndexStatus,
  type PremiseRetrievalResult,
  type PremiseRetriever,
} from "@mathos/retrieval"
import {
  BranchRepository,
  ClaimRepository,
  DependencyRepository,
  FormalStatementRepository,
  WorkspaceRepository,
} from "@mathos/storage"
import { ClaimNotFound } from "@mathos/shared"

export interface RetrievalServiceDependencies {
  root: string
  workspaces: WorkspaceRepository
  branches: BranchRepository
  claims: ClaimRepository
  dependencies: DependencyRepository
  formalStatements: FormalStatementRepository
  leanAdapter: LeanAdapter
  premiseRetriever: PremiseRetriever | null
  hasActiveAccounting: () => boolean
}

export interface ProofRetrievalResult {
  result: PremiseRetrievalResult
  context: string
  summary: ProofSession["retrieval"]
}

export class RetrievalService {
  constructor(private readonly d: RetrievalServiceDependencies) {}

  async forProof(input: {
    claim: Claim
    formal: FormalStatement
    diagnostics: string
    attempt: number
    previousNames: string[]
    skipInspect?: boolean
  }): Promise<ProofRetrievalResult> {
    const config = resolveRetrievalConfig(this.d.root)
    const unknown = extractUnknownIdentifiers(input.diagnostics)
    const dependencyNames = this.dependencyNames(input.claim.id)
    const result = await this.retriever().retrieve({
      query: input.formal.sourceText,
      goal: input.formal.sourceText,
      unknownIdentifiers: unknown,
      localBoosts: dependencyNames,
      dependencyNames,
      allowedLocalStatuses: config.includeUnverifiedLocal ? ["KERNEL_VERIFIED", "FORMALIZED_UNVERIFIED"] : ["KERNEL_VERIFIED"],
      maxPremises: config.maxPremises,
      candidatePool: config.candidatePool,
      inspectTopK: config.inspectTopK,
      excludeNames: [input.formal.declarationName],
      previousNames: input.previousNames,
      goalAware: config.goalAware,
      mode: unknown.length ? "DIAGNOSTIC_REPAIR" : "FORMAL_GOAL",
      skipInspect: input.skipInspect === true || this.d.hasActiveAccounting(),
    })
    writeRetrievalLog(this.d.root, {
      claimId: input.claim.id,
      attempt: input.attempt,
      query: result.query,
      names: result.candidates.map((item) => item.declaration.name),
      mode: result.mode,
      indexRevision: result.indexRevision,
      pool: result.candidatePoolSize,
      inspected: result.inspectedCount,
      cacheHits: result.cacheHits,
      enrichment: result.enrichment,
    })
    return {
      result,
      context: buildProofContext({
        formalStatement: input.formal.sourceText,
        naturalStatement: input.claim.naturalStatement,
        diagnostics: input.diagnostics,
        premises: result.candidates,
        goalProfile: result.goalProfile,
        config,
      }),
      summary: {
        localCount: result.localCount,
        mathlibCount: result.mathlibCount,
        topNames: result.candidates.slice(0, 6).map((item) => item.declaration.name),
        indexRevision: result.indexRevision,
        mode: result.mode,
        warning: result.warning,
        enrichment: result.enrichment,
        inspectedCount: result.inspectedCount,
        cacheHits: result.cacheHits,
        inspectSelectionStrategy: result.inspectSelectionStrategy,
        inspectSelectorVersion: result.inspectSelectorVersion,
        inspectionLimit: result.inspectionLimit,
        inspectedCandidates: result.inspectedCandidates,
        selectionReasons: result.selectionReasons,
        fusionMethod: result.fusionMethod,
      },
    }
  }

  indexStatus(): IndexStatus {
    const retriever = this.retriever()
    return retriever instanceof HybridPremiseRetriever
      ? retriever.status(null)
      : { present: true, stale: false, manifest: null, reason: "in-memory retriever" }
  }

  async indexBuild() {
    const environment = await this.d.leanAdapter.detect(this.d.root)
    const retriever = this.retriever()
    if (!(retriever instanceof HybridPremiseRetriever)) {
      return { revision: "memory", declarationCount: 0, mathlibCount: 0, workspaceCount: 0, builtAt: new Date().toISOString() }
    }
    return retriever.build(environment.leanVersion)
  }

  async searchTheorems(query: string, options: { goal?: string } = {}): Promise<PremiseRetrievalResult> {
    const config = resolveRetrievalConfig(this.d.root)
    const looksFormal = /theorem |lemma |:\s*\S/.test(query)
    return this.retriever().retrieve({
      query,
      goal: options.goal ?? (looksFormal ? query : undefined),
      maxPremises: config.maxPremises,
      candidatePool: config.candidatePool,
      inspectTopK: config.inspectTopK,
      goalAware: config.goalAware,
    })
  }

  async premisesForClaim(claimId: string, options: { skipInspect?: boolean } = {}): Promise<PremiseRetrievalResult> {
    const claim = this.getClaim(claimId)
    const formal = this.d.formalStatements.currentForClaim(claim.id)
    const config = resolveRetrievalConfig(this.d.root)
    const dependencyNames = this.dependencyNames(claim.id)
    return this.retriever().retrieve({
      query: formal?.sourceText ?? `${claim.title} ${claim.naturalStatement}`,
      goal: formal?.sourceText,
      localBoosts: dependencyNames,
      dependencyNames,
      allowedLocalStatuses: config.includeUnverifiedLocal ? ["KERNEL_VERIFIED", "FORMALIZED_UNVERIFIED"] : ["KERNEL_VERIFIED"],
      maxPremises: config.maxPremises,
      candidatePool: config.candidatePool,
      inspectTopK: config.inspectTopK,
      excludeNames: formal ? [formal.declarationName] : [],
      goalAware: config.goalAware,
      mode: formal ? "FORMAL_GOAL" : "NATURAL_FALLBACK",
      skipInspect: options.skipInspect === true,
    })
  }

  private retriever(): PremiseRetriever {
    return this.d.premiseRetriever ?? new HybridPremiseRetriever(this.d.root, () => this.localDeclarations(), this.d.leanAdapter)
  }

  private localDeclarations() {
    return this.listClaims().flatMap((claim) => {
      const formal = this.d.formalStatements.currentForClaim(claim.id)
      return formal ? [{ name: formal.declarationName, signature: formal.sourceText, claimId: claim.id, claimStatus: claim.status }] : []
    })
  }

  private listClaims(): Claim[] {
    const workspace = this.requireWorkspace()
    const branch = this.d.branches.current(workspace.id)
    if (!branch) throw new Error("Current branch is missing")
    const visible = this.d.claims.listVisible(branch.id)
    return visible.length ? visible : this.d.claims.list(workspace.id).filter((claim) => claim.branchId === branch.id)
  }

  private dependencyNames(claimId: string): string[] {
    const workspace = this.requireWorkspace()
    return this.d.dependencies.listForClaim(workspace.id, claimId).flatMap((item) => {
      const other = item.fromClaimId === claimId ? item.toClaimId : item.fromClaimId
      const formal = this.d.formalStatements.currentForClaim(other)
      return [other, formal?.declarationName ?? ""].filter(Boolean)
    })
  }

  private getClaim(id: string): Claim {
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

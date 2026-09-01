import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import {
  gitRefForBranch,
  MAIN_BRANCH_ID,
  nextBranchId,
  slugifyBranchName,
  type ArtifactRelation,
  type BranchDetail,
  type MergePreview,
  type MergePreviewItem,
  type ResearchBranch,
  type WorkspaceRecord,
} from "@mathos/domain"
import {
  BlockerRepository,
  BranchRepository,
  ClaimRepository,
  ClaimVisibilityRepository,
  ProofAttemptRepository,
  ResearchRunRepository,
  WorkspaceRepository,
} from "@mathos/storage"
import type { ResearchVcs, VcsStatus } from "@mathos/vcs"
import { ClaimNotFound, nowIso } from "@mathos/shared"

type BranchEvent = { target?: string | null; metadata?: Record<string, unknown> }

export interface BranchServiceDependencies {
  root: string
  workspaces: WorkspaceRepository
  branches: BranchRepository
  claims: ClaimRepository
  visibility: ClaimVisibilityRepository
  proofs: ProofAttemptRepository
  blockers: BlockerRepository
  runs: ResearchRunRepository
  vcs: ResearchVcs
  recordEvent: (action: string, event?: BranchEvent) => void
}

export class BranchService {
  constructor(private readonly d: BranchServiceDependencies) {}

  current(): ResearchBranch {
    const branch = this.d.branches.current(this.workspace().id) ?? this.d.branches.get(MAIN_BRANCH_ID)
    if (!branch) throw new Error("Current branch is missing")
    return branch
  }

  list(): ResearchBranch[] { return this.d.branches.list(this.workspace().id) }

  get(idOrName: string): ResearchBranch {
    const workspace = this.workspace()
    const key = idOrName.trim()
    const found = this.d.branches.get(key.toUpperCase())
      ?? this.d.branches.getByName(workspace.id, key)
      ?? this.d.branches.getByName(workspace.id, key.toUpperCase())
    if (!found || found.workspaceId !== workspace.id) throw new Error(`Branch ${idOrName} was not found.`)
    return found
  }

  detail(idOrName = this.current().id): BranchDetail {
    const branch = this.get(idOrName)
    const counts = this.d.visibility.counts(branch.id)
    const parent = branch.parentBranchId ? this.d.branches.get(branch.parentBranchId) : null
    const current = this.current()
    const visible = this.d.claims.listVisible(current.id)
    const currentClaims = visible.length
      ? visible
      : this.d.claims.list(this.workspace().id).filter((claim) => claim.branchId === current.id)
    const proofs = currentClaims
      .filter((claim) => this.d.visibility.relation(branch.id, claim.id) === "LOCAL")
      .reduce((sum, claim) => sum + this.d.proofs.listForClaim(claim.id).length, 0)
    return { branch, parent, localClaims: counts.local, inheritedClaims: counts.inherited, proofAttempts: proofs, blockers: this.d.blockers.openCriticalCount(this.workspace().id) }
  }

  async setup(): Promise<VcsStatus> {
    const status = await this.d.vcs.initialize(this.d.root)
    this.d.recordEvent("branch_versioning_initialized", { metadata: { root: status.root } })
    return status
  }

  async create(name: string, purpose?: string): Promise<ResearchBranch> {
    const workspace = this.workspace()
    const parent = this.current()
    const timestamp = nowIso()
    const slug = slugifyBranchName(name)
    const id = nextBranchId(this.d.branches.ids(workspace.id))
    const gitRef = gitRefForBranch(id, slug)
    const worktreePath = join(this.d.root, ".mathos", "worktrees", id)
    const branch: ResearchBranch = {
      id, workspaceId: workspace.id, name: name.trim() || slug, slug, parentBranchId: parent.id,
      purpose: purpose?.trim() || name.trim(), status: "ACTIVE", isCurrent: false, staleBase: false,
      createdFromEventId: null, gitRef: null, worktreePath: null, setupState: "READY", createdAt: timestamp, updatedAt: timestamp,
    }
    this.d.branches.insert(branch)
    this.d.visibility.copyInherited(parent.id, id, timestamp)
    const vcs = await this.d.vcs.detect(this.d.root)
    if (vcs.initialized) {
      try {
        await this.d.vcs.createBranch(this.d.root, gitRef)
        await this.d.vcs.createWorktree(this.d.root, gitRef, worktreePath)
        for (const dir of ["formal", "research", "experiments"]) mkdirSync(join(worktreePath, dir), { recursive: true })
        this.d.branches.updateWorktree(id, gitRef, worktreePath, "READY", timestamp)
      } catch (error) {
        await this.d.vcs.removeWorktree(this.d.root, worktreePath, gitRef).catch(() => undefined)
        this.d.branches.delete(id)
        throw error
      }
    }
    const created = this.get(id)
    this.d.recordEvent("branch_created", { target: id, metadata: { parent: parent.id, name: created.name, slug, purpose: created.purpose, gitRef: created.gitRef } })
    return created
  }

  switch(idOrName: string): ResearchBranch {
    const branch = this.get(idOrName)
    if (branch.status === "ABANDONED") throw new Error(`Branch ${branch.id} is abandoned.`)
    this.d.branches.setCurrent(this.workspace().id, branch.id, nowIso())
    this.d.recordEvent("branch_switched", { target: branch.id, metadata: { name: branch.name } })
    return this.get(branch.id)
  }

  pause(idOrName: string): ResearchBranch { return this.setStatus(idOrName, "PAUSED", "branch_paused") }

  resume(idOrName: string): ResearchBranch {
    const branch = this.setStatus(idOrName, "ACTIVE", "branch_reactivated")
    return this.switch(branch.id)
  }

  abandon(idOrName: string): ResearchBranch {
    const branch = this.get(idOrName)
    if (branch.id === MAIN_BRANCH_ID) throw new Error("MAIN cannot be abandoned.")
    const live = this.d.runs.liveOnBranch(this.workspace().id, branch.id)
    if (live) throw new Error(`ACTIVE_RESEARCH_RUN_EXISTS:${live.id}`)
    if (branch.isCurrent) this.switch(MAIN_BRANCH_ID)
    return this.setStatus(branch.id, "ABANDONED", "branch_abandoned")
  }

  claimRelation(claimId: string): ArtifactRelation {
    const claim = this.d.claims.get(claimId.trim().toUpperCase())
    if (!claim) throw new ClaimNotFound(claimId)
    const relation = this.d.visibility.relation(this.current().id, claim.id)
    return relation === "MERGED" || relation === "INHERITED" || relation === "LOCAL" ? relation : "LOCAL"
  }

  previewMerge(sourceId: string, targetId = MAIN_BRANCH_ID): MergePreview {
    const source = this.get(sourceId)
    const target = this.get(targetId)
    const targetClaims = new Set(this.d.visibility.list(target.id).map((item) => item.claimId))
    const items: MergePreviewItem[] = []
    for (const row of this.d.visibility.list(source.id).filter((item) => item.relation === "LOCAL")) {
      const claim = this.d.claims.get(row.claimId)
      if (!claim || targetClaims.has(claim.id)) continue
      const verified = claim.status === "KERNEL_VERIFIED"
      items.push({ kind: verified ? "verified_proof" : "claim", id: claim.id, change: "ADDITIVE", summary: claim.title, safe: true, reverifyRequired: verified })
    }
    if (source.worktreePath) this.collectFileChanges(source.worktreePath, items)
    const conflicts = items.filter((item) => item.change === "CONFLICT").length
    return {
      sourceId: source.id, targetId: target.id, items,
      additiveClaims: items.filter((item) => item.kind === "claim" && item.change === "ADDITIVE").length,
      verifiedProofs: items.filter((item) => item.kind === "verified_proof").length,
      formalChanges: items.filter((item) => item.kind === "formal_file").length,
      conflicts, safeToAutoMerge: conflicts === 0,
    }
  }

  merge(sourceId: string, options: { applySafe?: boolean } = {}): MergePreview {
    const preview = this.previewMerge(sourceId)
    this.d.recordEvent("branch_merge_started", { target: sourceId, metadata: { conflicts: preview.conflicts } })
    if (!options.applySafe) return preview
    const running = this.d.runs.runningOnBranch(this.workspace().id, this.get(sourceId).id)
    if (running) throw new Error(`ACTIVE_RESEARCH_RUN_EXISTS:${running.id}`)
    if (preview.conflicts > 0) {
      this.d.recordEvent("branch_merge_conflict", { target: sourceId, metadata: { conflicts: preview.conflicts } })
      throw new Error("Merge has conflicts and cannot auto-apply.")
    }
    const timestamp = nowIso()
    for (const item of preview.items.filter((row) => row.safe && (row.kind === "claim" || row.kind === "verified_proof"))) {
      const claim = this.d.claims.get(item.id)
      if (!claim) continue
      this.d.visibility.insert(preview.targetId, claim.id, "MERGED", timestamp)
      if (item.reverifyRequired && claim.status === "KERNEL_VERIFIED") this.d.claims.updateStatus(claim.id, "STALE", timestamp)
    }
    this.d.branches.updateStatus(sourceId, "MERGED", timestamp)
    this.d.recordEvent("branch_merge_completed", { target: sourceId, metadata: { additive: preview.additiveClaims } })
    return preview
  }

  private workspace(): WorkspaceRecord {
    const workspace = this.d.workspaces.get()
    if (!workspace) throw new Error("Workspace is not initialized")
    return workspace
  }

  private setStatus(idOrName: string, status: ResearchBranch["status"], action: string): ResearchBranch {
    const branch = this.get(idOrName)
    this.d.branches.updateStatus(branch.id, status, nowIso())
    this.d.recordEvent(action, { target: branch.id })
    return this.get(branch.id)
  }

  private collectFileChanges(worktreePath: string, items: MergePreviewItem[]): void {
    const compare = (rel: string) => {
      const child = join(worktreePath, rel)
      const parent = join(this.d.root, rel)
      if (!existsSync(child)) return
      const kind = rel.startsWith("formal") ? "formal_file" as const : "research_note" as const
      if (!existsSync(parent)) items.push({ kind, id: rel, change: "ADDITIVE", summary: rel, safe: true })
      else if (readFileSync(parent, "utf8") !== readFileSync(child, "utf8")) items.push({ kind, id: rel, change: "CONFLICT", summary: rel, safe: false })
    }
    const walk = (rel: string) => {
      const dir = join(worktreePath, rel)
      if (!existsSync(dir) || !statSync(dir).isDirectory()) return
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith(".")) continue
        const next = join(rel, entry)
        if (statSync(join(worktreePath, next)).isDirectory()) walk(next)
        else compare(next)
      }
    }
    walk("formal")
    walk("research")
  }
}

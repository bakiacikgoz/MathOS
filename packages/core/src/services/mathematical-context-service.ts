import { createHash } from "node:crypto"
import { canonicalContextHash, parseContextItemDraft, type ContextConflict, type ContextItemDraft, type ContextScopeKind, type MathematicalContextItem, type MathematicalContextSnapshot } from "@mathos/domain"
import type { ContextItemRepository, ContextRevisionRepository } from "@mathos/storage"
import type { ClockPort } from "../ports/clock-port.ts"

export interface ContextScope { workspaceId: string; branchId: string; documentId?: string; claimId?: string }
export interface ContextProposalInput { workspaceId: string; branchId: string; scopeKind: ContextScopeKind; scopeId: string; draft: ContextItemDraft }
export interface MathematicalContextDependencies {
  items: ContextItemRepository
  revisions: ContextRevisionRepository
  clock: ClockPort
  nextId(prefix: string): string
  writeEvent(type: string, payload: Record<string, unknown>): void
}

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")

export class MathematicalContextService {
  constructor(private readonly d: MathematicalContextDependencies) {}

  proposeItem(input: ContextProposalInput): MathematicalContextItem {
    const draft = parseContextItemDraft(input.draft)
    const now = this.d.clock.now()
    const id = this.d.nextId("CTX")
    const item: MathematicalContextItem = {
      id, workspaceId: input.workspaceId, branchId: input.branchId, scopeKind: input.scopeKind, scopeId: input.scopeId,
      kind: draft.kind, canonicalName: draft.canonicalName, displayText: draft.displayText,
      normalizedValue: draft.normalizedValue ?? "", leanExpression: draft.leanExpression ?? null,
      sourceClaimId: draft.sourceClaimId ?? null, status: draft.status, origin: draft.origin, revision: 1,
      contentHash: digest({ ...draft, displayText: draft.displayText }), createdAt: now, updatedAt: now,
    }
    this.d.items.insert(item)
    this.d.writeEvent("context.item.proposed", { itemId: id, scopeKind: item.scopeKind, scopeId: item.scopeId, contentHash: item.contentHash, origin: item.origin })
    return item
  }

  applyProposal(id: string, expectedRevision: number): MathematicalContextItem {
    const item = this.d.items.get(id)
    if (!item) throw new Error(`CONTEXT_NOT_FOUND: ${id}`)
    if (item.revision !== expectedRevision || item.status !== "PROPOSED") throw new Error(`REVISION_CONFLICT: ${id}`)
    const applied = this.d.items.activateAndSupersede(id, expectedRevision)
    const revisionId = this.d.nextId("CR")
    this.d.revisions.insert({ id: revisionId, workspaceId: item.workspaceId, branchId: item.branchId, snapshotHash: applied.contentHash, parentRevisionId: null, changedItemIds: [id], createdBy: "USER", createdAt: this.d.clock.now() })
    this.d.writeEvent("context.item.applied", { itemId: id, revision: applied.revision, contentHash: applied.contentHash })
    this.d.writeEvent("context.revision.created", { revisionId, changedItemIds: [id], snapshotHash: applied.contentHash })
    return applied
  }

  resolveSnapshot(scope: ContextScope): MathematicalContextSnapshot {
    const chain: Array<[ContextScopeKind, string | undefined]> = [["WORKSPACE", scope.workspaceId], ["BRANCH", scope.branchId], ["DOCUMENT", scope.documentId], ["CLAIM", scope.claimId]]
    const all = this.d.items.list(scope.workspaceId, { limit: 10_000 }).filter((item) => item.status === "ACTIVE")
    const selected = new Map<string, MathematicalContextItem>()
    for (const [kind, id] of chain) {
      if (!id) continue
      for (const item of all.filter((candidate) => candidate.scopeKind === kind && candidate.scopeId === id)) selected.set(`${item.kind}:${item.canonicalName.normalize("NFC")}`, item)
    }
    const items = [...selected.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.canonicalName.localeCompare(b.canonicalName))
    const snapshotHash = canonicalContextHash(items)
    return { revisionId: `snapshot:${snapshotHash}`, snapshotHash, items }
  }

  detectConflicts(scope: ContextScope): ContextConflict[] {
    const chainIds = new Set([scope.workspaceId, scope.branchId, scope.documentId, scope.claimId].filter(Boolean))
    const all = this.d.items.list(scope.workspaceId, { limit: 10_000 }).filter((item) => chainIds.has(item.scopeId) && item.status !== "REJECTED")
    const byName = new Map<string, MathematicalContextItem[]>()
    for (const item of all) { const key = item.canonicalName.normalize("NFC"); byName.set(key, [...(byName.get(key) ?? []), item]) }
    return [...byName.entries()].flatMap(([name, items]) => new Set(items.map((item) => item.kind)).size > 1
      ? [{ kind: "INCOMPATIBLE_KIND", itemIds: items.map((item) => item.id).sort(), message: `Incompatible context kinds for ${name}` }]
      : [])
  }
}

import { memorySearchTerms, nextSequentialId, parseMemoryNoteDraft, type ClaimStatus, type MemoryNote, type MemoryNoteBasis, type MemoryNoteDraft, type MemoryNoteKind, type MemoryNoteStatus } from "@mathos/domain"
import type { MemoryNoteRepository } from "@mathos/storage"
import type { ClockPort } from "../ports/clock-port.ts"

export interface ResearchMemoryDependencies {
  notes: MemoryNoteRepository
  clock: ClockPort
  unitOfWork<T>(work: () => T): T
  claimStatus(claimId: string): ClaimStatus | null
  /** The branch and the branches it was started from, nearest first. */
  branchLineage(branchId: string): string[]
}
export interface MemoryScope { workspaceId: string; branchId: string }
/** A note as it reads now: a LEAN note whose claim is no longer verified (its statement changed) says so. */
export type MemoryNoteView = MemoryNote & { claimVerified: boolean | null }
export interface MemoryListOptions { kind?: MemoryNoteKind; claimId?: string; status?: MemoryNoteStatus | "ALL"; query?: string; limit?: number }

export class ResearchMemoryService {
  constructor(private readonly d: ResearchMemoryDependencies) {}

  add(scope: MemoryScope, draft: MemoryNoteDraft): MemoryNoteView {
    const parsed = parseMemoryNoteDraft(draft)
    if (parsed.claimId && !this.d.claimStatus(parsed.claimId)) throw new Error(`CLAIM_NOT_FOUND: ${parsed.claimId}`)
    if (parsed.basis === "LEAN" && this.d.claimStatus(parsed.claimId!) !== "KERNEL_VERIFIED") throw new Error(`MEMORY_LEAN_BASIS_NEEDS_VERIFIED_CLAIM: ${parsed.claimId} is not verified by the Lean kernel`)
    const now = this.d.clock.now()
    const note = this.d.unitOfWork(() => {
      const note: MemoryNote = {
        id: nextSequentialId(this.d.notes.listForWorkspace(scope.workspaceId).map((item) => item.id), "MEM"),
        workspaceId: scope.workspaceId, branchId: scope.branchId, scopeKind: parsed.scopeKind, kind: parsed.kind, text: parsed.text,
        basis: parsed.basis, status: parsed.status, origin: parsed.origin, claimId: parsed.claimId, sourceRef: parsed.sourceRef,
        reason: null, revision: 1, createdAt: now, updatedAt: now,
      }
      this.d.notes.insert(note)
      return note
    })
    return this.view(note)
  }

  /** The user keeps a model's proposed note. Its basis stays MODEL: keeping a suggestion does not make it true. */
  accept(id: string): MemoryNoteView { return this.transition(id, ["PROPOSED"], { status: "ACTIVE" }) }
  reject(id: string, reason?: string): MemoryNoteView { return this.transition(id, ["PROPOSED"], { status: "REJECTED", reason: reason?.trim() || null }) }
  archive(id: string, reason?: string): MemoryNoteView { return this.transition(id, ["ACTIVE", "PROPOSED"], { status: "ARCHIVED", reason: reason?.trim() || null }) }
  restore(id: string): MemoryNoteView { return this.transition(id, ["ARCHIVED"], { status: "ACTIVE" }) }
  /** Marks a note shown false (a counterexample, a gap); it stays visible so nobody follows it again. */
  refute(id: string, reason: string): MemoryNoteView {
    if (!reason?.trim()) throw new Error("MEMORY_REFUTE_REASON_REQUIRED")
    return this.transition(id, ["ACTIVE", "PROPOSED"], { status: "ACTIVE", basis: "REFUTED", reason: reason.trim() })
  }

  get(id: string): MemoryNoteView {
    const note = this.d.notes.get(id.trim().toUpperCase())
    if (!note) throw new Error(`MEMORY_NOTE_NOT_FOUND: ${id}`)
    return this.view(note)
  }

  /** Notes seen from a branch: workspace notes, and branch notes of this branch and the branches it came from. */
  list(scope: MemoryScope, options: MemoryListOptions = {}): MemoryNoteView[] {
    const lineage = new Set(this.d.branchLineage(scope.branchId))
    const status = options.status ?? "ACTIVE"
    const claimId = options.claimId?.trim().toUpperCase()
    const terms = options.query ? memorySearchTerms(options.query) : []
    const visible = this.d.notes.listForWorkspace(scope.workspaceId).filter((note) =>
      (note.scopeKind === "WORKSPACE" || lineage.has(note.branchId))
      && (status === "ALL" || note.status === status)
      && (!options.kind || note.kind === options.kind)
      && (!claimId || note.claimId === claimId))
    const ranked = terms.length
      ? visible.map((note) => ({ note, score: matchScore(note, terms) })).filter((row) => row.score > 0).sort((a, b) => b.score - a.score || b.note.updatedAt.localeCompare(a.note.updatedAt)).map((row) => row.note)
      : visible
    return ranked.slice(0, options.limit ?? 200).map((note) => this.view(note))
  }

  /** What a model should know before working on a claim: its own notes first, then the rest, newest first. */
  relevant(scope: MemoryScope, claimId: string | null, limit = 12): MemoryNoteView[] {
    const active = this.list(scope)
    const id = claimId?.trim().toUpperCase()
    const linked = id ? active.filter((note) => note.claimId === id) : []
    return [...linked, ...active.filter((note) => !linked.includes(note))].slice(0, limit)
  }

  private transition(id: string, from: MemoryNoteStatus[], patch: { status: MemoryNoteStatus; basis?: MemoryNoteBasis; reason?: string | null }): MemoryNoteView {
    const note = this.d.notes.get(id.trim().toUpperCase())
    if (!note) throw new Error(`MEMORY_NOTE_NOT_FOUND: ${id}`)
    if (!from.includes(note.status)) throw new Error(`MEMORY_NOTE_STATE_INVALID: ${note.id} is ${note.status}`)
    return this.view(this.d.notes.updateExpectedRevision(note.id, note.revision, { ...patch, updatedAt: this.d.clock.now() }))
  }

  private view(note: MemoryNote): MemoryNoteView {
    return { ...note, claimVerified: note.claimId ? this.d.claimStatus(note.claimId) === "KERNEL_VERIFIED" : null }
  }
}

function matchScore(note: MemoryNote, terms: string[]): number {
  const words = new Set(memorySearchTerms(`${note.text} ${note.kind} ${note.claimId ?? ""}`))
  let score = 0
  for (const term of terms) if (words.has(term)) score += 2; else if ([...words].some((word) => word.startsWith(term))) score += 1
  return score
}

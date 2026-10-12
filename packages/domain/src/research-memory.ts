// Research memory: what the mathematician decided, abandoned, wondered about or prefers in this workspace.
// A note is a record, never evidence. Its basis says where it came from, and only a claim the Lean kernel verified can
// back a LEAN note; approving a model's note keeps it, it does not make it true.

export const MEMORY_NOTE_KINDS = ["DECISION", "DEAD_END", "OPEN_QUESTION", "IDEA", "INSIGHT", "PREFERENCE"] as const
export type MemoryNoteKind = typeof MEMORY_NOTE_KINDS[number]
/** USER: the mathematician said it. MODEL: a model suggested it. LEAN: a kernel-verified claim backs it. REFUTED: shown false. */
export const MEMORY_NOTE_BASES = ["USER", "MODEL", "LEAN", "REFUTED"] as const
export type MemoryNoteBasis = typeof MEMORY_NOTE_BASES[number]
export type MemoryNoteStatus = "PROPOSED" | "ACTIVE" | "ARCHIVED" | "REJECTED"
/** WORKSPACE notes are seen on every branch; BRANCH notes on their branch and the branches started from it. */
export type MemoryNoteScope = "WORKSPACE" | "BRANCH"

export interface MemoryNote {
  id: string
  workspaceId: string
  branchId: string
  scopeKind: MemoryNoteScope
  kind: MemoryNoteKind
  text: string
  basis: MemoryNoteBasis
  status: MemoryNoteStatus
  origin: "USER" | "MODEL"
  claimId: string | null
  /** Where it came from: a conversation message, a proof attempt, a claim. */
  sourceRef: string | null
  /** Why it was refuted, rejected or archived. */
  reason: string | null
  revision: number
  createdAt: string
  updatedAt: string
}

export interface MemoryNoteDraft {
  kind: MemoryNoteKind
  text: string
  origin: "USER" | "MODEL"
  basis?: MemoryNoteBasis
  scopeKind?: MemoryNoteScope
  claimId?: string | null
  sourceRef?: string | null
  /** A model's note waits for the user unless the user already approved it (the assistant's approval card). */
  approved?: boolean
}

export const MEMORY_NOTE_MAX_CHARS = 2_000

export function parseMemoryNoteDraft(value: MemoryNoteDraft): Required<Omit<MemoryNoteDraft, "approved">> & { status: MemoryNoteStatus } {
  const kind = String(value.kind ?? "").toUpperCase() as MemoryNoteKind
  if (!MEMORY_NOTE_KINDS.includes(kind)) throw new Error(`MEMORY_KIND_INVALID: ${value.kind}; use ${MEMORY_NOTE_KINDS.join(", ")}`)
  const text = String(value.text ?? "").normalize("NFC").trim()
  if (!text) throw new Error("MEMORY_TEXT_REQUIRED")
  if (text.length > MEMORY_NOTE_MAX_CHARS) throw new Error(`MEMORY_TEXT_TOO_LONG: at most ${MEMORY_NOTE_MAX_CHARS} characters`)
  if (value.origin !== "USER" && value.origin !== "MODEL") throw new Error("MEMORY_ORIGIN_INVALID")
  const basis = (value.basis ?? value.origin) as MemoryNoteBasis
  if (!MEMORY_NOTE_BASES.includes(basis)) throw new Error(`MEMORY_BASIS_INVALID: ${value.basis}`)
  // A model cannot vouch for anything: its note is a suggestion whatever it claims.
  if (value.origin === "MODEL" && basis !== "MODEL") throw new Error("MODEL_MEMORY_BASIS_MUST_BE_MODEL")
  if (basis === "LEAN" && !value.claimId) throw new Error("MEMORY_LEAN_BASIS_NEEDS_VERIFIED_CLAIM")
  const scopeKind = value.scopeKind ?? "BRANCH"
  if (scopeKind !== "WORKSPACE" && scopeKind !== "BRANCH") throw new Error(`MEMORY_SCOPE_INVALID: ${value.scopeKind}`)
  return {
    kind, text, origin: value.origin, basis, scopeKind,
    claimId: value.claimId ? value.claimId.trim().toUpperCase() : null,
    sourceRef: value.sourceRef?.trim() || null,
    status: value.origin === "MODEL" && value.approved !== true ? "PROPOSED" : "ACTIVE",
  }
}

/** Accent- and case-insensitive words, so "Tümevarım" finds "tumevarim". */
export function memorySearchTerms(value: string): string[] {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("en").replace(/ı/g, "i").split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 1)
}

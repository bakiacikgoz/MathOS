import { runJson } from "./bridge.ts"
import { useQuery } from "./query.ts"
import type { Lang } from "./i18n.ts"

export type MemoryKind = "DECISION" | "DEAD_END" | "OPEN_QUESTION" | "IDEA" | "INSIGHT" | "PREFERENCE"
export const MEMORY_KINDS: MemoryKind[] = ["DECISION", "DEAD_END", "OPEN_QUESTION", "IDEA", "INSIGHT", "PREFERENCE"]
export interface MemoryNote {
  id: string; kind: MemoryKind; text: string; basis: "USER" | "MODEL" | "LEAN" | "REFUTED"; status: "PROPOSED" | "ACTIVE" | "ARCHIVED" | "REJECTED"
  origin: "USER" | "MODEL"; scopeKind: "WORKSPACE" | "BRANCH"; claimId: string | null; reason: string | null; claimVerified: boolean | null; updatedAt: string
}
export interface ContextItem { id: string; kind: string; canonicalName: string; displayText: string; scopeKind: string; scopeId: string; status: string; origin: string; updatedAt: string }
export interface Preference { id: string; text: string }
export interface LibraryEntry { id: string; name: string; title: string; kind: string; naturalStatement: string; leanStatement: string; proofBody: string; source: { workspace: string; claimId: string } }
export interface FailureRow { id: string; failureClass: string; occurrenceCount: number; attemptedApproach: string; normalizedDiagnostic: string; lastSeenAt: string }
export const CONVENTION_KINDS = ["CONVENTION", "NOTATION", "SYMBOL", "ASSUMPTION", "DOMAIN_CONSTRAINT"] as const

export const memoryKeys = {
  notes: (root: string) => `${root}|memory`,
  context: (root: string) => `${root}|memory|context`,
  failures: (root: string) => `${root}|memory|failures`,
  /** Personal memory is the same for every workspace; the root only keys the cache. */
  profile: (root: string) => `${root}|memory|profile`,
  library: (root: string) => `${root}|memory|library`,
}
const data = <T,>(root: string, args: string[]) => runJson<{ data: T }>(root, args).then((value) => value.data)
export const useMemoryNotes = (root: string) => useQuery(memoryKeys.notes(root), () => data<MemoryNote[]>(root, ["memory", "list", "--all"]))
export const useConventions = (root: string) => useQuery(memoryKeys.context(root), () => data<ContextItem[]>(root, ["context", "list"]))
export const useFailures = (root: string) => useQuery(memoryKeys.failures(root), () => data<FailureRow[]>(root, ["failures", "list"]))
export const useProfile = (root: string) => useQuery(memoryKeys.profile(root), () => data<{ path: string; preferences: Preference[] }>(root, ["profile", "show"]))
export const useLibrary = (root: string) => useQuery(memoryKeys.library(root), () => data<LibraryEntry[]>(root, ["library", "list"]))

const KIND: Record<MemoryKind, [string, string]> = {
  DECISION: ["Karar", "Decision"], DEAD_END: ["Çıkmaz yol", "Dead end"], OPEN_QUESTION: ["Açık soru", "Open question"],
  IDEA: ["Fikir", "Idea"], INSIGHT: ["Gözlem", "Insight"], PREFERENCE: ["Tercih", "Preference"],
}
export const memoryKindLabel = (kind: string, lang: Lang) => KIND[kind as MemoryKind]?.[lang === "tr" ? 0 : 1] ?? kind

/** Where a note comes from, in the words the page shows; a note is never evidence. */
export function memoryBasisLabel(note: Pick<MemoryNote, "basis" | "status" | "claimVerified" | "claimId">, lang: Lang): string {
  const tr = lang === "tr"
  if (note.basis === "LEAN" && note.claimVerified === false) return tr ? `${note.claimId} artık doğrulanmış değil` : `${note.claimId} is no longer verified`
  if (note.basis === "MODEL" && note.status === "PROPOSED") return tr ? "Model önerisi · onay bekliyor" : "Model suggestion · awaiting you"
  return { USER: tr ? "Sizin notunuz" : "Your note", MODEL: tr ? "Model önerisi (tuttunuz)" : "Model suggestion (kept)", LEAN: tr ? `Lean ile doğrulandı (${note.claimId})` : `Lean-verified (${note.claimId})`, REFUTED: tr ? "Çürütüldü" : "Refuted" }[note.basis]
}

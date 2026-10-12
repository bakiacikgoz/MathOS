// How MathOS's memory reaches a model: short, labelled sections it can act on. Each one says what it is, and none of
// them is evidence: only the Lean kernel verifies.
import { createHash } from "node:crypto"
import type { FailureFingerprint, MathematicalContextItem } from "@mathos/domain"
import type { MemoryNoteView } from "./services/research-memory-service.ts"

const clip = (value: string, max: number) => value.length > max ? `${value.slice(0, max)}…` : value

/** The same Lean statement, written the same way, is the same proof goal across sessions. */
export function proofGoalHash(leanStatement: string): string {
  return createHash("sha256").update(leanStatement.normalize("NFC").replace(/\s+/g, " ").trim()).digest("hex")
}

/** The conventions the user approved for this claim (workspace, branch and claim scope, nearest wins). */
export function renderContextForPrompt(items: MathematicalContextItem[]): string {
  if (!items.length) return ""
  const lines = items.map((item) => {
    const value = item.normalizedValue && item.normalizedValue !== item.displayText ? ` = ${item.normalizedValue}` : ""
    const lean = item.leanExpression ? ` (Lean: ${item.leanExpression})` : ""
    return `- ${item.kind} ${item.canonicalName}: ${clip(item.displayText, 400)}${value}${lean}`
  })
  return `WORKSPACE CONVENTIONS (approved by the user; read the statement with them and keep them in Lean):\n${lines.join("\n")}`
}

/** Earlier sessions' failed proofs of this very statement, so the model does not walk into the same wall again. */
export function renderPriorFailures(failures: FailureFingerprint[]): string {
  if (!failures.length) return ""
  const rows = failures.map((failure, index) => [
    `#${index + 1} (failed ${failure.occurrenceCount}×, ${failure.failureClass})`,
    `\`\`\`lean\n${clip(failure.attemptedApproach, 900)}\n\`\`\``,
    `Lean: ${clip(failure.normalizedDiagnostic, 500)}`,
  ].join("\n"))
  return `EARLIER FAILED ATTEMPTS ON THIS STATEMENT (earlier sessions; do not repeat them, take a different route):\n${rows.join("\n\n")}`
}

const BASIS: Record<string, string> = { USER: "the user's own note", MODEL: "a model's suggestion the user kept", LEAN: "backed by a Lean-verified claim", REFUTED: "REFUTED, do not rely on it" }
export function memoryBasisLabel(note: Pick<MemoryNoteView, "basis" | "claimVerified" | "claimId"> & { status?: MemoryNoteView["status"] }): string {
  if (note.basis === "LEAN" && note.claimVerified === false) return `was backed by ${note.claimId}, which is no longer verified`
  if (note.basis === "MODEL" && note.status === "PROPOSED") return "a model's suggestion, not yet reviewed by the user"
  return BASIS[note.basis] ?? note.basis
}

/** The research memory notes, each with its kind and where it comes from. */
export function renderMemoryNotes(notes: MemoryNoteView[], options: { heading?: boolean } = {}): string {
  if (!notes.length) return ""
  const lines = notes.map((note) => `- ${note.id} ${note.kind}${note.claimId ? ` [${note.claimId}]` : ""} (${memoryBasisLabel(note)}): ${clip(note.text, 600)}${note.basis === "REFUTED" && note.reason ? ` Refuted because: ${clip(note.reason, 300)}` : ""}`)
  return options.heading === false ? lines.join("\n") : `RESEARCH MEMORY (notes the user keeps; records, not proof):\n${lines.join("\n")}`
}

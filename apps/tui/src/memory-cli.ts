// `mathos memory`, `mathos profile` and `mathos library`: the research memory of a workspace, and the mathematician's
// own preferences and verified results across workspaces. Notes are records; only the Lean kernel verifies.
import { join } from "node:path"
import { PersonalMemoryStore, acceptedProofBody, memoryBasisLabel, renderPreferences, type MathOS, type MemoryNoteView, type PersonalLibraryEntry } from "@mathos/core"
import { MEMORY_NOTE_KINDS, type MemoryNoteBasis, type MemoryNoteKind, type MemoryNoteStatus } from "@mathos/domain"

const flag = (args: string[], name: string): string | undefined => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1] }
const FLAGS_WITH_VALUES = new Set(["--kind", "--text", "--claim", "--scope", "--basis", "--source", "--reason", "--status", "--limit"])
/** Words that are not flags or flag values, e.g. the search query or an id. */
const positional = (args: string[]): string[] => args.filter((value, index) => !value.startsWith("--") && !FLAGS_WITH_VALUES.has(args[index - 1] ?? ""))
const print = (json: boolean, schemaVersion: string, data: unknown, text: () => string) => { process.stdout.write(json ? `${JSON.stringify({ schemaVersion, data }, null, 2)}\n` : `${text()}\n`) }

export const personalMemoryPath = (userConfigRoot: string) => join(userConfigRoot, "personal-memory.json")

function noteLine(note: MemoryNoteView): string {
  const state = note.status === "ACTIVE" ? "" : ` ${note.status}`
  return `${note.id}  ${note.kind}${state}${note.claimId ? `  [${note.claimId}]` : ""}  (${memoryBasisLabel(note)})\n  ${note.text.replace(/\n/g, "\n  ")}${note.reason ? `\n  reason: ${note.reason}` : ""}`
}
const notesText = (notes: MemoryNoteView[]) => notes.length ? notes.map(noteLine).join("\n\n") : "No memory notes."

/** `mathos memory …` inside a workspace. The preferences (user level) are added to the brief the assistant reads. */
export function runMemoryCommand(app: MathOS, rest: string[], store: PersonalMemoryStore): number {
  const action = rest[0] ?? "list", args = rest.slice(1), json = args.includes("--json"), memory = app.services.researchMemory, scope = app.memoryScope()
  const id = () => { const value = positional(args)[0]; if (!value) throw new Error(`Usage: mathos memory ${action} <MEM-001>`); return value }
  const one = (note: MemoryNoteView) => { print(json, "mathos.memory.v1", note, () => noteLine(note)); return 0 }
  if (action === "list" || action === "search") {
    const status = args.includes("--all") ? "ALL" : (flag(args, "--status")?.toUpperCase() as MemoryNoteStatus | undefined)
    const query = action === "search" ? positional(args).join(" ") : undefined
    if (action === "search" && !query) throw new Error("Usage: mathos memory search <words> [--claim C-001]")
    const notes = memory.list(scope, { status, kind: flag(args, "--kind")?.toUpperCase() as MemoryNoteKind | undefined, claimId: flag(args, "--claim"), query, limit: Number(flag(args, "--limit") ?? 200) })
    print(json, "mathos.memory.v1", notes, () => notesText(notes)); return 0
  }
  if (action === "add") {
    const kind = flag(args, "--kind"), text = flag(args, "--text") ?? positional(args).join(" ")
    if (!kind || !text) throw new Error(`Usage: mathos memory add --kind ${MEMORY_NOTE_KINDS.join("|")} --text "..." [--claim C-001] [--scope workspace|branch] [--basis user|lean]`)
    const origin = args.includes("--origin-model") ? "MODEL" : "USER"
    const note = memory.add(scope, {
      kind: kind.toUpperCase() as MemoryNoteKind, text, origin, claimId: flag(args, "--claim") ?? null,
      basis: (flag(args, "--basis")?.toUpperCase() as MemoryNoteBasis | undefined) ?? origin,
      scopeKind: flag(args, "--scope")?.toUpperCase() === "WORKSPACE" ? "WORKSPACE" : "BRANCH",
      sourceRef: flag(args, "--source") ?? null,
      // A model's note the user approved on its card is kept at once; --propose leaves it for the Memory page.
      approved: origin === "MODEL" && !args.includes("--propose"),
    })
    return one(note)
  }
  if (action === "show") return one(memory.get(id()))
  if (action === "accept") return one(memory.accept(id()))
  if (action === "reject") return one(memory.reject(id(), flag(args, "--reason")))
  if (action === "archive") return one(memory.archive(id(), flag(args, "--reason")))
  if (action === "restore") return one(memory.restore(id()))
  if (action === "refute") { const reason = flag(args, "--reason"); if (!reason) throw new Error("Usage: mathos memory refute <MEM-001> --reason \"why it is false\""); return one(memory.refute(id(), reason)) }
  if (action === "brief") {
    const claimId = flag(args, "--claim") ?? null
    const text = [renderPreferences(store.read().preferences), app.memoryBrief(claimId)].filter(Boolean).join("\n\n")
    print(json, "mathos.memory-brief.v1", { text }, () => text || "Memory is empty."); return 0
  }
  throw new Error(`Unknown memory action: ${action}`)
}

/** `mathos failures list [--claim C-001]`: the failed proof approaches MathOS remembers. */
export function runFailureList(app: MathOS, args: string[]): number {
  const claimId = flag(args, "--claim"), json = args.includes("--json")
  const failures = claimId ? app.claimFailures(claimId) : app.services.repositories.failureFingerprints.list(undefined, { limit: 200 })
  print(json, "mathos.failure-memory-list.v1", failures, () => failures.length
    ? failures.map((failure: any) => `${failure.id}  ${failure.failureClass}  failed ${failure.occurrenceCount}×  last ${failure.lastSeenAt}\n  ${String(failure.attemptedApproach).split("\n").slice(0, 4).join("\n  ")}\n  Lean: ${String(failure.normalizedDiagnostic).split("\n")[0]}`).join("\n\n")
    : claimId ? `No failed proof attempts recorded for ${claimId.toUpperCase()}'s current Lean statement.` : "No failed proof attempts recorded.")
  return 0
}

/** `mathos profile …`: the preferences the assistant follows in every workspace. */
export function runProfileCommand(rest: string[], store: PersonalMemoryStore): number {
  const action = rest[0] ?? "show", args = rest.slice(1), json = args.includes("--json")
  if (action === "show" || action === "list") {
    const memory = store.read()
    print(json, "mathos.profile.v1", { path: store.path, preferences: memory.preferences, libraryEntries: memory.library.length }, () => [
      `Personal memory: ${store.path}`, "", "PREFERENCES", ...(memory.preferences.length ? memory.preferences.map((item) => `  ${item.id}  ${item.text}`) : ["  none"]), "", `LIBRARY  ${memory.library.length} verified result${memory.library.length === 1 ? "" : "s"}`,
    ].join("\n"))
    return 0
  }
  if (action === "add") {
    const text = flag(args, "--text") ?? positional(args).join(" ")
    if (!text) throw new Error("Usage: mathos profile add \"Answer in Turkish; use ℕ starting at 0\"")
    const preference = store.addPreference(text)
    print(json, "mathos.profile.v1", preference, () => `${preference.id}  ${preference.text}`); return 0
  }
  if (action === "remove") {
    const id = positional(args)[0]; if (!id) throw new Error("Usage: mathos profile remove <PREF-001>")
    store.removePreference(id); print(json, "mathos.profile.v1", { removed: id.toUpperCase() }, () => `Removed ${id.toUpperCase()}`); return 0
  }
  throw new Error(`Unknown profile action: ${action}`)
}

const libraryLine = (entry: PersonalLibraryEntry) => `${entry.id}  ${entry.name}  (${entry.kind}, verified in ${entry.source.workspace} as ${entry.source.claimId})\n  ${entry.title}`
const libraryDetail = (entry: PersonalLibraryEntry) => [libraryLine(entry), "", entry.naturalStatement, "", entry.leanStatement, ":=", entry.proofBody, "", "Verified in its own workspace; here it is not verified until Lean checks it (check_proof / verify)."].join("\n")

/** `mathos library …` outside a workspace: the verified results kept across workspaces. `add` needs a workspace. */
export function runLibraryCommand(rest: string[], store: PersonalMemoryStore): number {
  const action = rest[0] ?? "list", args = rest.slice(1), json = args.includes("--json")
  if (action === "list" || action === "search") {
    const entries = action === "search" ? store.searchLibrary(positional(args).join(" ")) : store.read().library
    print(json, "mathos.library.v1", entries, () => entries.length ? entries.map(libraryLine).join("\n\n") : "The personal library is empty. Add a verified claim with: mathos library add C-001")
    return 0
  }
  const id = positional(args)[0]
  if (action === "show") { if (!id) throw new Error("Usage: mathos library show <LIB-001>"); const entry = store.getLemma(id); print(json, "mathos.library.v1", entry, () => libraryDetail(entry)); return 0 }
  if (action === "remove") { if (!id) throw new Error("Usage: mathos library remove <LIB-001>"); store.removeLemma(id); print(json, "mathos.library.v1", { removed: id.toUpperCase() }, () => `Removed ${id.toUpperCase()}`); return 0 }
  throw new Error(`Unknown library action: ${action}`)
}

/** `mathos library add C-001`: keeps a claim the Lean kernel verified, with its accepted proof. */
export function addClaimToLibrary(app: MathOS, rest: string[], store: PersonalMemoryStore): number {
  const args = rest.slice(1), json = args.includes("--json"), id = positional(args)[0]
  if (!id) throw new Error("Usage: mathos library add <C-001>")
  const claim = app.getClaim(id.trim().toUpperCase())
  if (claim.status !== "KERNEL_VERIFIED") throw new Error(`LIBRARY_CLAIM_NOT_VERIFIED: ${claim.id} is ${claim.status}; only results the Lean kernel verified go into the library`)
  const formal = app.getFormal(claim.id)
  const accepted = app.listProofs(claim.id).filter((attempt) => attempt.status === "KERNEL_ACCEPTED" && attempt.formalStatementId === formal.id).at(-1)
  if (!accepted) throw new Error(`LIBRARY_PROOF_NOT_FOUND: ${claim.id} has no accepted proof for its current Lean statement`)
  const { entry, duplicate } = store.addLemma({
    name: formal.declarationName, title: claim.title, kind: claim.kind, naturalStatement: claim.naturalStatement, leanStatement: formal.sourceText,
    proofBody: acceptedProofBody(accepted.proofSource), leanVersion: accepted.leanVersion,
    source: { workspace: app.requireWorkspace().name, claimId: claim.id, proofAttemptId: accepted.id }, verifiedAt: accepted.createdAt,
  })
  print(json, "mathos.library.v1", { entry, duplicate }, () => `${duplicate ? "Already in the library" : "Added"}: ${libraryLine(entry)}`)
  return 0
}

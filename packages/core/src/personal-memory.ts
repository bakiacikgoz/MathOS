// The mathematician's own memory across workspaces: standing preferences for the assistant, and a library of results
// the Lean kernel verified in one of their workspaces. It is a plain JSON file in the user's MathOS config folder,
// readable and editable by hand. Nothing in it is verified in another workspace until Lean checks it there.
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { memorySearchTerms, nextSequentialId } from "@mathos/domain"

export interface PersonalPreference { id: string; text: string; createdAt: string }
export interface PersonalLibraryEntry {
  id: string
  /** The Lean declaration name. */
  name: string
  title: string
  kind: string
  naturalStatement: string
  leanStatement: string
  /** Only the part after `:=`, ready for check_proof against the same statement elsewhere. */
  proofBody: string
  leanVersion: string | null
  source: { workspace: string; claimId: string; proofAttemptId: string }
  verifiedAt: string
  addedAt: string
  contentHash: string
}
export interface PersonalMemory { schemaVersion: "mathos.personal-memory.v1"; preferences: PersonalPreference[]; library: PersonalLibraryEntry[] }

export const PERSONAL_PREFERENCE_MAX_CHARS = 500
export const PERSONAL_PREFERENCE_LIMIT = 40
const empty = (): PersonalMemory => ({ schemaVersion: "mathos.personal-memory.v1", preferences: [], library: [] })

export class PersonalMemoryStore {
  constructor(readonly path: string, private readonly now: () => string = () => new Date().toISOString()) {}

  read(): PersonalMemory {
    if (!existsSync(this.path)) return empty()
    let value: Partial<PersonalMemory>
    try { value = JSON.parse(readFileSync(this.path, "utf8")) as Partial<PersonalMemory> }
    catch { throw new Error(`PERSONAL_MEMORY_INVALID: ${this.path} is not valid JSON; fix or remove it`) }
    if (value.schemaVersion !== "mathos.personal-memory.v1") throw new Error(`PERSONAL_MEMORY_INVALID: ${this.path} has an unknown schemaVersion`)
    return { ...empty(), preferences: Array.isArray(value.preferences) ? value.preferences : [], library: Array.isArray(value.library) ? value.library : [] }
  }

  addPreference(text: string): PersonalPreference {
    const value = text.normalize("NFC").trim()
    if (!value) throw new Error("PREFERENCE_TEXT_REQUIRED")
    if (value.length > PERSONAL_PREFERENCE_MAX_CHARS) throw new Error(`PREFERENCE_TEXT_TOO_LONG: at most ${PERSONAL_PREFERENCE_MAX_CHARS} characters`)
    const memory = this.read()
    if (memory.preferences.length >= PERSONAL_PREFERENCE_LIMIT) throw new Error(`PREFERENCE_LIMIT_REACHED: at most ${PERSONAL_PREFERENCE_LIMIT}; remove one first`)
    const preference = { id: nextSequentialId(memory.preferences.map((item) => item.id), "PREF"), text: value, createdAt: this.now() }
    this.write({ ...memory, preferences: [...memory.preferences, preference] })
    return preference
  }

  removePreference(id: string): void {
    const memory = this.read(), key = id.trim().toUpperCase()
    if (!memory.preferences.some((item) => item.id === key)) throw new Error(`PREFERENCE_NOT_FOUND: ${id}`)
    this.write({ ...memory, preferences: memory.preferences.filter((item) => item.id !== key) })
  }

  /** Keeps a verified result; the same statement with the same proof is kept once. */
  addLemma(entry: Omit<PersonalLibraryEntry, "id" | "addedAt" | "contentHash">): { entry: PersonalLibraryEntry; duplicate: boolean } {
    const contentHash = createHash("sha256").update(JSON.stringify([entry.leanStatement.trim(), entry.proofBody.trim()])).digest("hex")
    const memory = this.read()
    const existing = memory.library.find((item) => item.contentHash === contentHash)
    if (existing) return { entry: existing, duplicate: true }
    const added: PersonalLibraryEntry = { ...entry, id: nextSequentialId(memory.library.map((item) => item.id), "LIB"), addedAt: this.now(), contentHash }
    this.write({ ...memory, library: [...memory.library, added] })
    return { entry: added, duplicate: false }
  }

  removeLemma(id: string): void {
    const memory = this.read(), key = id.trim().toUpperCase()
    if (!memory.library.some((item) => item.id === key)) throw new Error(`LIBRARY_ENTRY_NOT_FOUND: ${id}`)
    this.write({ ...memory, library: memory.library.filter((item) => item.id !== key) })
  }

  getLemma(id: string): PersonalLibraryEntry {
    const entry = this.read().library.find((item) => item.id === id.trim().toUpperCase())
    if (!entry) throw new Error(`LIBRARY_ENTRY_NOT_FOUND: ${id}`)
    return entry
  }

  searchLibrary(query: string, limit = 10): PersonalLibraryEntry[] {
    const terms = memorySearchTerms(query), library = this.read().library
    if (!terms.length) return library.slice(-limit).reverse()
    return library.map((entry) => {
      const words = memorySearchTerms(`${entry.name} ${entry.title} ${entry.naturalStatement} ${entry.leanStatement}`)
      const score = terms.reduce((sum, term) => sum + (words.includes(term) ? 2 : words.some((word) => word.startsWith(term)) ? 1 : 0), 0)
      return { entry, score }
    }).filter((row) => row.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((row) => row.entry)
  }

  private write(memory: PersonalMemory): void {
    mkdirSync(dirname(this.path), { recursive: true })
    const temp = `${this.path}.${process.pid}.tmp`
    writeFileSync(temp, `${JSON.stringify(memory, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
    renameSync(temp, this.path)
  }
}

/** The proof body of an accepted proof (`<declaration> :=\n<body>`), so it can be checked against the same statement elsewhere. */
export function acceptedProofBody(proofSource: string): string {
  const index = proofSource.indexOf(" :=\n")
  return (index === -1 ? proofSource : proofSource.slice(index + 4)).trim()
}

/** The preferences as the assistant reads them. */
export function renderPreferences(preferences: PersonalPreference[]): string {
  if (!preferences.length) return ""
  return `THE MATHEMATICIAN'S STANDING PREFERENCES (they wrote these; follow them unless a trust rule says otherwise):\n${preferences.map((item) => `- ${item.text}`).join("\n")}`
}

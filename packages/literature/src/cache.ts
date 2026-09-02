import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { queryFingerprint, type LiteratureQuery, type LiteratureSearchResult } from "./index.ts"
interface CacheEntry { expiresAt: number; results: LiteratureSearchResult[] }
export class LiteratureCache {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly now: () => number
  private readonly path?: string
  constructor(options: { now?: () => number; path?: string } = {}) { this.now = options.now ?? Date.now; this.path = options.path; if (this.path && existsSync(this.path)) { const parsed = JSON.parse(readFileSync(this.path, "utf8")) as { entries?: Array<[string, CacheEntry]> }; for (const [key, entry] of parsed.entries ?? []) this.entries.set(key, entry) } }
  get(key: string): LiteratureSearchResult[] | null { const entry = this.entries.get(key); if (!entry) return null; if (entry.expiresAt < this.now()) { this.entries.delete(key); this.persist(); return null } return entry.results.map(result => ({ ...result, authors: [...result.authors] })) }
  set(key: string, results: LiteratureSearchResult[], ttlMs: number): void { this.entries.set(key, { expiresAt: this.now() + Math.max(0, ttlMs), results: results.map(result => ({ ...result, authors: [...result.authors] })) }); this.persist() }
  getForQuery(provider: string, query: LiteratureQuery): LiteratureSearchResult[] | null { return this.get(queryFingerprint(provider, query)) }
  setForQuery(provider: string, query: LiteratureQuery, results: LiteratureSearchResult[], ttlMs: number): void { this.set(queryFingerprint(provider, query), results, ttlMs) }
  private persist(): void { if (!this.path) return; mkdirSync(dirname(this.path), { recursive: true }); const temporary = `${this.path}.${process.pid}.tmp`; writeFileSync(temporary, `${JSON.stringify({ schemaVersion: "mathos-literature-cache-v1", entries: [...this.entries] })}\n`, { encoding: "utf8", mode: 0o600 }); renameSync(temporary, this.path) }
}

import type { Database } from "bun:sqlite"

export interface Page { limit?: number; offset?: number }

export class V1StorageDecodeError extends Error {
  readonly code = "STORAGE_DECODE_ERROR"
  constructor(table: string, column: string, cause: unknown) {
    super(`STORAGE_DECODE_ERROR: invalid JSON in ${table}.${column}`, { cause })
    this.name = "V1StorageDecodeError"
  }
}

export class V1RevisionConflictError extends Error {
  readonly code = "REVISION_CONFLICT"
  constructor(id: string) {
    super(`REVISION_CONFLICT: ${id}`)
    this.name = "V1RevisionConflictError"
  }
}

const camel = (value: string) => value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
const snake = (value: string) => value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)

export class V1Repository<T extends { id: string; revision?: number }> {
  constructor(
    protected readonly db: Database,
    private readonly table: string,
    private readonly columns: readonly string[],
    private readonly jsonColumns: readonly string[] = [],
    private readonly orderBy = "id",
  ) {}

  insert(value: T): void {
    const names = this.columns.map((key) => this.column(key))
    const parameters = this.columns.map((key) => this.encode(key, value[key as keyof T]))
    this.db.query(`INSERT INTO ${this.table} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).run(...parameters as never[])
  }

  get(id: string): T | null {
    const row = this.db.query<Record<string, unknown>, [string]>(`SELECT * FROM ${this.table} WHERE id = ?`).get(id)
    return row ? this.decode(row) : null
  }

  list(scopeId?: string, page: Page = {}): T[] {
    const limit = Math.max(0, page.limit ?? 100)
    const offset = Math.max(0, page.offset ?? 0)
    const scope = this.scopeColumn()
    const sql = scope && scopeId !== undefined
      ? `SELECT * FROM ${this.table} WHERE ${scope} = ? ORDER BY ${this.orderBy}, id LIMIT ? OFFSET ?`
      : `SELECT * FROM ${this.table} ORDER BY ${this.orderBy}, id LIMIT ? OFFSET ?`
    const rows = scope && scopeId !== undefined
      ? this.db.query<Record<string, unknown>, [string, number, number]>(sql).all(scopeId, limit, offset)
      : this.db.query<Record<string, unknown>, [number, number]>(sql).all(limit, offset)
    return rows.map((row) => this.decode(row))
  }

  updateExpectedRevision(id: string, expectedRevision: number, patch: Partial<T>): T {
    const allowed = Object.entries(patch).filter(([key]) => key !== "id" && key !== "revision" && this.columns.includes(key))
    const assignments = [...allowed.map(([key]) => `${this.column(key)} = ?`), "revision = revision + 1"]
    const values = allowed.map(([key, value]) => this.encode(key, value))
    const result = this.db.query(`UPDATE ${this.table} SET ${assignments.join(", ")} WHERE id = ? AND revision = ?`).run(...values as never[], id, expectedRevision)
    if (result.changes !== 1) throw new V1RevisionConflictError(id)
    return this.get(id)!
  }

  protected decode(row: Record<string, unknown>): T {
    const value: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(row)) {
      const property = camel(key.endsWith("_json") ? key.slice(0, -5) : key)
      if (this.jsonColumns.includes(property)) {
        try { value[property] = JSON.parse(String(raw)) }
        catch (error) { throw new V1StorageDecodeError(this.table, key, error) }
      } else if (typeof raw === "number" && ["exact", "deterministic", "humanReviewed", "invalidated"].includes(property)) {
        value[property] = raw === 1
      } else value[property] = raw
    }
    return value as T
  }

  private encode(key: string, value: unknown): unknown {
    if (this.jsonColumns.includes(key)) return JSON.stringify(value)
    if (typeof value === "boolean") return value ? 1 : 0
    return value
  }

  private column(key: string): string {
    const name = snake(key)
    return this.jsonColumns.includes(key) ? `${name}_json` : name
  }

  private scopeColumn(): string | null {
    for (const candidate of ["workspaceId", "documentId", "claimId", "portfolioId", "proofJobId", "candidateId", "failureId", "jobId", "proposalId", "packetId", "sourceId"]) {
      if (this.columns.includes(candidate)) return snake(candidate)
    }
    return null
  }
}

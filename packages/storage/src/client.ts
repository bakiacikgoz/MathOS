import { Database } from "bun:sqlite"
import { copyFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { StorageUnavailable, WorkspaceOperationLock, WorkspaceSchemaTooNew, nowIso } from "@mathos/shared"
import { MIGRATIONS, SCHEMA_EPOCH } from "./migrations.ts"

/** @internal Low-level database lifecycle API. It is not a supported domain mutation surface. */
export class DatabaseClient {
  readonly db: Database

  constructor(private readonly filePath: string) {
    try {
      mkdirSync(dirname(filePath), { recursive: true })
      this.db = new Database(filePath, { create: true })
      this.db.exec("PRAGMA foreign_keys = ON;")
      this.db.exec("PRAGMA journal_mode = WAL;")
      this.db.exec("PRAGMA busy_timeout = 5000;")
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new StorageUnavailable(reason, { path: filePath })
    }
  }

  schemaEpoch(): number {
    try {
      const row = this.db.query<{ value: string }, []>("SELECT value FROM mathos_meta WHERE key = 'schema_epoch'").get()
      return row ? Number(row.value) : 0
    } catch {
      return 0
    }
  }

  /**
   * Runs related repository writes as one SQLite transaction. Services migrating
   * mutation/event atomicity should insert the canonical event inside this unit,
   * then update external projections only after it returns successfully.
   */
  unitOfWork<T>(work: () => T): T {
    return this.db.transaction(work)()
  }

  migrate(): void {
    const lock = WorkspaceOperationLock.acquire(dirname(dirname(this.filePath)), "migration")
    try {
    const previousEpoch = this.schemaEpoch()
    if (previousEpoch > 0 && previousEpoch < SCHEMA_EPOCH) this.createPreMigrationBackup(previousEpoch)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `)

    try {
      const row = this.db.query<{ value: string }, []>("SELECT value FROM mathos_meta WHERE key = 'schema_epoch'").get()
      if (row && Number(row.value) > SCHEMA_EPOCH) {
        throw new WorkspaceSchemaTooNew(Number(row.value), SCHEMA_EPOCH)
      }
    } catch (error) {
      if (error instanceof WorkspaceSchemaTooNew) throw error
    }

    const applied = new Set(
      this.db
        .query<{ id: string }, []>("SELECT id FROM schema_migrations")
        .all()
        .map((row) => row.id),
    )

    const insert = this.db.query("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")

    const runPendingMigrations = this.db.transaction(() => {
      for (const migration of MIGRATIONS) {
        if (applied.has(migration.id)) continue
        this.db.exec(migration.sql)
        insert.run(migration.id, nowIso())
      }
      this.db.exec(`CREATE TABLE IF NOT EXISTS mathos_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`)
      this.db.query("INSERT INTO mathos_meta (key, value) VALUES ('schema_epoch', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(SCHEMA_EPOCH))
    })
    runPendingMigrations()
    this.normalizeMainBranch()
    const integrity = this.db.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get()?.integrity_check
    if (integrity !== "ok") throw new StorageUnavailable(`post-migration integrity check failed: ${integrity ?? "unknown"}`, { path: this.filePath })
    } finally { lock.release() }
  }

  private createPreMigrationBackup(previousEpoch: number): void {
    this.db.exec("PRAGMA wal_checkpoint(FULL)")
    const directory = join(dirname(this.filePath), "backups"); mkdirSync(directory, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, "")
    copyFileSync(this.filePath, join(directory, `pre-migration-${previousEpoch}-${stamp}.db`))
  }

  private normalizeMainBranch(): void {
    const row = this.db.query<{ id: string; workspace_id: string; name: string; status: string; created_at: string }, []>(
      "SELECT id, workspace_id, name, status, created_at FROM branches ORDER BY created_at LIMIT 1",
    ).get()
    if (!row) return
    const timestamp = nowIso()
    this.db.exec("PRAGMA foreign_keys = OFF")
    try {
      const run = this.db.transaction(() => {
        if (row.id !== "B-000") {
          this.db.query(
            `INSERT OR IGNORE INTO branches (id, workspace_id, name, status, is_current, created_at, slug, parent_branch_id, purpose, updated_at, created_from_event_id, git_ref, worktree_path, stale_base, setup_state)
             SELECT 'B-000', workspace_id, 'MAIN', 'ACTIVE', is_current, created_at, 'main', NULL, purpose, ?, created_from_event_id, git_ref, worktree_path, stale_base, setup_state FROM branches WHERE id = ?`,
          ).run(timestamp, row.id)
          this.db.query("UPDATE claims SET branch_id = 'B-000' WHERE branch_id = ?").run(row.id)
          this.db.query("UPDATE claim_branch_visibility SET branch_id = 'B-000' WHERE branch_id = ?").run(row.id)
          this.db.query("DELETE FROM branches WHERE id = ?").run(row.id)
        }
        this.db.query(
          "UPDATE branches SET name = 'MAIN', slug = COALESCE(slug, 'main'), status = 'ACTIVE', updated_at = COALESCE(updated_at, created_at), setup_state = COALESCE(setup_state, 'READY') WHERE id = 'B-000'",
        ).run()
        this.db.exec(
          `INSERT OR IGNORE INTO claim_branch_visibility (branch_id, claim_id, relation, created_at)
           SELECT branch_id, id, 'LOCAL', created_at FROM claims`,
        )
      })
      run()
    } finally {
      this.db.exec("PRAGMA foreign_keys = ON")
    }
  }

  close(): void {
    this.db.close()
  }
}

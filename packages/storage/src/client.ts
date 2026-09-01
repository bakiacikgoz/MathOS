import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { StorageUnavailable, WorkspaceSchemaTooNew, nowIso } from "@mathos/shared"
import { MIGRATIONS, SCHEMA_EPOCH } from "./migrations.ts"

export class DatabaseClient {
  readonly db: Database

  constructor(filePath: string) {
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

  migrate(): void {
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

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue
      const run = this.db.transaction(() => {
        this.db.exec(migration.sql)
        insert.run(migration.id, nowIso())
      })
      run()
    }
    this.db.exec(`CREATE TABLE IF NOT EXISTS mathos_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`)
    this.db.query("INSERT INTO mathos_meta (key, value) VALUES ('schema_epoch', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(SCHEMA_EPOCH))
    this.normalizeMainBranch()
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

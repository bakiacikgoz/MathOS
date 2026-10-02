import { afterEach, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseClient, MIGRATIONS, SCHEMA_EPOCH, writeDatabaseSnapshot } from "@mathos/storage"

const roots: string[] = []
function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "mathos-storage-snapshot-"))
  roots.push(root)
  return root
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function historicalDatabase(path: string, epoch: number): Database {
  const database = new Database(path, { create: true })
  database.exec("CREATE TABLE schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
  for (const migration of MIGRATIONS.slice(0, epoch)) {
    database.exec(migration.sql)
    database.query("INSERT INTO schema_migrations VALUES (?, 'fixture')").run(migration.id)
  }
  database.query("INSERT INTO mathos_meta(key,value) VALUES ('schema_epoch',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(epoch))
  database.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0")
  return database
}

test("a snapshot from a live WAL database reopens alone as a pre-migration backup", () => {
  const root = temporaryRoot(), source = join(root, "source.db"), target = join(root, "recovered.db")
  const database = historicalDatabase(source, 29)
  try {
    database.exec("INSERT INTO workspaces(id,name,root_path,main_objective_id,created_at,updated_at) VALUES('W-1','Research','fixture',NULL,'then','then')")
    database.exec("INSERT INTO events(id,workspace_id,timestamp,actor_type,actor_id,action,target,metadata_json) VALUES('EV-1','W-1','then','user','researcher','fixture',NULL,'{}')")
    expect(existsSync(`${source}-wal`)).toBe(true)
    writeDatabaseSnapshot(database, target)
    expect(existsSync(`${target}-wal`)).toBe(false)
    expect(existsSync(`${target}-shm`)).toBe(false)
    const inspection = new Database(target, { readonly: true })
    try {
      expect(inspection.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()?.journal_mode).toBe("delete")
      expect(inspection.query<{ value: string }, []>("SELECT value FROM mathos_meta WHERE key='schema_epoch'").get()?.value).toBe("29")
      expect(inspection.query("SELECT id FROM events").all()).toEqual([{ id: "EV-1" }])
    } finally { inspection.close() }
    const recovered = new DatabaseClient(target)
    try {
      expect(recovered.schemaEpoch()).toBe(29)
      recovered.migrate()
      expect(recovered.schemaEpoch()).toBe(SCHEMA_EPOCH)
      expect(recovered.db.query("SELECT id FROM events").all()).toEqual([{ id: "EV-1" }])
    } finally { recovered.close() }
  } finally { database.close() }
})

test("snapshot retains the logical sequence of sparse legacy event rowids", () => {
  const root = temporaryRoot(), source = join(root, "source.db"), target = join(root, "legacy.db")
  const database = historicalDatabase(source, 16)
  try {
    database.exec("INSERT INTO workspaces(id,name,root_path,main_objective_id,created_at,updated_at) VALUES('W-1','Research','fixture',NULL,'then','then')")
    for (const [rowid, id] of [[5, "EV-5"], [20, "EV-20"], [99, "EV-99"]] as const) {
      database.query("INSERT INTO events(rowid,id,workspace_id,timestamp,actor_type,actor_id,action,target,metadata_json) VALUES(? ,?,'W-1','then','user','researcher','fixture',NULL,'{}')").run(rowid, id)
    }
    writeDatabaseSnapshot(database, target)
    const recovered = new DatabaseClient(target)
    try {
      expect(recovered.schemaEpoch()).toBe(16)
      expect(recovered.db.query("SELECT id FROM events ORDER BY rowid").all()).toEqual([{ id: "EV-5" }, { id: "EV-20" }, { id: "EV-99" }])
      recovered.migrate()
      expect(recovered.db.query("SELECT id FROM events ORDER BY projection_order").all()).toEqual([{ id: "EV-5" }, { id: "EV-20" }, { id: "EV-99" }])
    } finally { recovered.close() }
  } finally { database.close() }
})

test("snapshot accepts a read-only source connection while a writer stays open", () => {
  const root = temporaryRoot(), source = join(root, "source.db"), target = join(root, "readonly-source.db")
  const writer = new Database(source, { create: true })
  try {
    writer.exec("PRAGMA journal_mode=WAL; CREATE TABLE mathos_meta(key TEXT PRIMARY KEY,value TEXT); INSERT INTO mathos_meta VALUES('schema_epoch','7'); CREATE TABLE facts(id TEXT PRIMARY KEY); INSERT INTO facts VALUES('committed')")
    const reader = new Database(source, { readonly: true })
    try { writeDatabaseSnapshot(reader, target) } finally { reader.close() }
    const reopened = new Database(target, { readonly: true })
    try { expect(reopened.query("SELECT * FROM facts").all()).toEqual([{ id: "committed" }]) } finally { reopened.close() }
  } finally { writer.close() }
})

test("snapshot refuses to overwrite an existing backup and removes its own failed staging", () => {
  const root = temporaryRoot(), source = join(root, "source.db"), target = join(root, "backup.db")
  const database = historicalDatabase(source, 16)
  try {
    writeFileSync(target, "existing backup")
    expect(() => writeDatabaseSnapshot(database, target)).toThrow("already exists")
    expect(readFileSync(target, "utf8")).toBe("existing backup")
    rmSync(target)
    database.exec("BEGIN")
    expect(() => writeDatabaseSnapshot(database, target)).toThrow()
    database.exec("ROLLBACK")
    expect(existsSync(target)).toBe(false)
    expect(readdirSync(root).filter(name => name.includes("snapshot-"))).toEqual([])
  } finally { database.close() }
})

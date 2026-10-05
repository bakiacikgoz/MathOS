import { expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { DatabaseClient, SCHEMA_EPOCH } from "@mathos/storage"

test("current-schema migration reserves the writer before a concurrent WAL commit can stale its snapshot", () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-migration-contention-"))
  let client: DatabaseClient | null = null, peer: Database | null = null
  try {
    const path = join(root, ".mathos", "mathos.db")
    client = new DatabaseClient(path)
    client.migrate()
    client.db.exec("CREATE TABLE contention_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
    client.db.query("INSERT INTO contention_probe VALUES (0, 'preserved')").run()
    const migrationIds = client.db.query("SELECT id FROM schema_migrations ORDER BY id").all()
    peer = new Database(path)
    peer.exec("PRAGMA busy_timeout = 0")
    const contender = peer
    const originalExec = client.db.exec
    let reached = false, blocked = false
    // Schedule a real second connection immediately after the existing-table
    // schema read; no production hook, retry, delay, or fake SQLite is involved.
    client.db.exec = (...args) => {
      const result = originalExec.apply(client!.db, args)
      if (!reached && args[0].includes("CREATE TABLE IF NOT EXISTS mathos_meta")) {
        reached = true
        try { contender.query("INSERT INTO contention_probe VALUES (1, 'concurrent')").run() }
        catch (error) { expect(error).toMatchObject({ code: "SQLITE_BUSY" }); blocked = true }
      }
      return result
    }
    try { client.migrate() }
    finally { client.db.exec = originalExec }
    expect(reached).toBe(true)
    expect(blocked).toBe(true)
    contender.query("INSERT INTO contention_probe VALUES (1, 'concurrent')").run()
    expect(client.schemaEpoch()).toBe(SCHEMA_EPOCH)
    expect(client.db.query("SELECT id FROM schema_migrations ORDER BY id").all()).toEqual(migrationIds)
    expect(client.db.query("SELECT value FROM contention_probe ORDER BY id").all()).toEqual([{ value: "preserved" }, { value: "concurrent" }])
    expect(client.db.query("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" })
  } finally {
    // A close failure retains the owned fixture rather than deleting beneath it.
    try { peer?.close() }
    finally { client?.close() }
    const safe = resolve(root)
    if (dirname(safe) !== resolve(tmpdir()) || !basename(safe).startsWith("mathos-migration-contention-")) throw new Error(`Unsafe migration fixture cleanup: ${safe}`)
    rmSync(safe, { recursive: true, force: true })
  }
})

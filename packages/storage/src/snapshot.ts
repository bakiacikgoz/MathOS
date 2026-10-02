import { Database } from "bun:sqlite"
import { closeSync, existsSync, fsyncSync, linkSync, mkdirSync, mkdtempSync, openSync, rmSync } from "node:fs"
import { basename, dirname, join } from "node:path"

function schemaEpoch(database: Database): string | null {
  const metadata = database.query("SELECT name FROM sqlite_master WHERE type='table' AND name='mathos_meta'").get()
  if (!metadata) return null
  return database.query<{ value: string }, []>("SELECT value FROM mathos_meta WHERE key='schema_epoch'").get()?.value ?? null
}

function legacyEventIds(database: Database): IterableIterator<{ id: string }> | null {
  const events = database.query("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get()
  if (!events) return null
  const columns = database.query<{ name: string }, []>("PRAGMA table_info(events)").all()
  if (columns.some(({ name }) => name === "projection_order")) return null
  return database.query<{ id: string }, []>("SELECT id FROM events ORDER BY rowid").iterate()
}

function assertLegacyEventOrder(source: Database, snapshot: Database): void {
  const sourceIds = legacyEventIds(source)
  const snapshotIds = legacyEventIds(snapshot)
  if (!sourceIds && !snapshotIds) return
  if (!sourceIds || !snapshotIds) throw new Error("database snapshot changed the events table")
  try {
    while (true) {
      const original = sourceIds.next(), copied = snapshotIds.next()
      if (original.done && copied.done) return
      if (original.done !== copied.done || original.value?.id !== copied.value?.id) {
        throw new Error("database snapshot changed legacy event order")
      }
    }
  } finally { sourceIds.return?.(); snapshotIds.return?.() }
}

/** @internal Creates an independent, verified SQLite backup without publishing partial files. */
export function writeDatabaseSnapshot(database: Database, destination: string): void {
  if (existsSync(destination)) throw new Error(`database snapshot already exists: ${destination}`)
  const parent = dirname(destination)
  mkdirSync(parent, { recursive: true })
  const staging = mkdtempSync(join(parent, `.${basename(destination)}-snapshot-`))
  const temporary = join(staging, "database.db")
  try {
    // SQLite reads a consistent committed view, including WAL frames that have
    // not been checkpointed. Concurrent commits after this view are not included.
    // The temporary database is never a live workspace.
    database.query("VACUUM INTO ?").run(temporary)
    const snapshot = new Database(temporary)
    try {
      const journal = snapshot.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()?.journal_mode.toLowerCase()
      if (journal !== "delete") {
        const converted = snapshot.query<{ journal_mode: string }, []>("PRAGMA journal_mode=DELETE").get()?.journal_mode.toLowerCase()
        if (converted !== "delete") throw new Error(`database snapshot journal mode is ${converted ?? "unknown"}`)
      }
      const integrity = snapshot.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get()?.integrity_check
      if (integrity !== "ok") throw new Error(`database snapshot integrity check failed: ${integrity ?? "unknown"}`)
      if (schemaEpoch(snapshot) !== schemaEpoch(database)) throw new Error("database snapshot schema epoch changed")
      // Old migrations derive projection_order from the implicit event rowid.
      // VACUUM may renumber rowids, so reject any snapshot that changes order.
      assertLegacyEventOrder(database, snapshot)
    } finally { snapshot.close() }
    if (existsSync(`${temporary}-wal`) || existsSync(`${temporary}-shm`) || existsSync(`${temporary}-journal`)) {
      throw new Error("database snapshot has SQLite sidecar files")
    }
    // Windows requires a writable handle for FlushFileBuffers/fsync.
    const handle = openSync(temporary, "r+")
    try { fsyncSync(handle) } finally { closeSync(handle) }
    // Hard-link publication is atomic and refuses an existing destination on
    // both POSIX and Windows. The source and destination share one filesystem.
    linkSync(temporary, destination)
    if (process.platform !== "win32") {
      // Persist the published directory entry on POSIX. Windows does not
      // expose a portable directory fsync through node:fs.
      const directoryHandle = openSync(parent, "r")
      try { fsyncSync(directoryHandle) } finally { closeSync(directoryHandle) }
    }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

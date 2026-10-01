import { afterEach, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, backupWorkspace, restoreWorkspace } from "@mathos/core"
import { DatabaseClient, MIGRATIONS, SCHEMA_EPOCH } from "@mathos/storage"
import { WorkspaceSchemaTooNew } from "@mathos/shared"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeModelProvider } from "@mathos/models"
import { FakeVcs } from "@mathos/vcs"
import { AssistantStore } from "../packages/core/src/assistant/store.ts"

const roots: string[] = []
const temporaryRoot = () => { const root = mkdtempSync(join(tmpdir(), "mathos-public-upgrade-")); roots.push(root); return root }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

test("a future schema is rejected without changing database bytes or creating tables", () => {
  const root = temporaryRoot(), path = join(root, "future.db")
  const future = new Database(path, { create: true })
  future.exec(`CREATE TABLE mathos_meta(key TEXT PRIMARY KEY, value TEXT); INSERT INTO mathos_meta VALUES('schema_epoch','${SCHEMA_EPOCH + 1}'); CREATE TABLE future_research(payload TEXT); INSERT INTO future_research VALUES('preserve me')`)
  future.close()
  const hash = () => createHash("sha256").update(readFileSync(path)).digest("hex")
  const before = hash()
  let client: DatabaseClient | undefined
  expect(() => { try { client = new DatabaseClient(path); client.migrate() } finally { client?.close() } }).toThrow(WorkspaceSchemaTooNew)
  expect(hash()).toBe(before)
  const reopened = new Database(path, { readonly: true })
  try { expect(reopened.query("SELECT name FROM sqlite_master WHERE name='schema_migrations'").get()).toBeNull() } finally { reopened.close() }
  expect(existsSync(`${path}-wal`)).toBe(false)
})

test("a future schema with recoverable WAL is rejected without checkpointing its files", () => {
  const root = temporaryRoot(), path = join(root, "future-wal.db")
  const script = `import { Database } from 'bun:sqlite'; const db = new Database(${JSON.stringify(path)}); db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE mathos_meta(key TEXT PRIMARY KEY,value TEXT); INSERT INTO mathos_meta VALUES('schema_epoch','${SCHEMA_EPOCH + 1}'); CREATE TABLE future_research(payload TEXT); INSERT INTO future_research VALUES('WAL-only commit')"); process.kill(process.pid, 'SIGKILL')`
  Bun.spawnSync([process.execPath, "-e", script], { stdout: "ignore", stderr: "pipe" })
  expect(existsSync(`${path}-wal`)).toBe(true)
  const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex")
  const before = [hash(path), hash(`${path}-wal`)]
  let client: DatabaseClient | undefined
  expect(() => { try { client = new DatabaseClient(path); client.migrate() } finally { client?.close() } }).toThrow(WorkspaceSchemaTooNew)
  expect(existsSync(`${path}-wal`)).toBe(true)
  expect([hash(path), hash(`${path}-wal`)]).toEqual(before)
})

// Construct the historical schema from its actual migrations, then copy only
// columns that existed in it. This is not a current DB with its epoch relabeled.
function rebuildHistoricalSchema(path: string, epoch: number) {
  const original = new Database(path)
  const tables = original.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
  const rows = new Map(tables.map(({ name }) => [name, original.query(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[]]))
  original.close()
  rmSync(path)
  const historical = new Database(path, { create: true })
  try {
    historical.exec("CREATE TABLE schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
    for (const migration of MIGRATIONS.slice(0, epoch)) {
      historical.exec(migration.sql)
      historical.query("INSERT INTO schema_migrations VALUES (?, 'historical-fixture')").run(migration.id)
    }
    const legacyTables = historical.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
    historical.exec("PRAGMA foreign_keys=OFF")
    // Accepted claims are inserted after their persisted verification evidence;
    // the historical integrity triggers remain enabled throughout the fixture.
    legacyTables.sort((a, b) => Number(a.name === "claims") - Number(b.name === "claims"))
    for (const { name } of legacyTables) {
      if (name === "schema_migrations" || name === "mathos_meta") continue
      const columns = historical.query<{ name: string }, []>(`PRAGMA table_info("${name}")`).all().map(row => row.name)
      for (const row of rows.get(name) ?? []) {
        const keys = columns.filter(column => column in row)
        const verifiedClaim = name === "claims" && row.status === "KERNEL_VERIFIED"
        historical.query(`INSERT INTO "${name}" (${keys.map(key => `"${key}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...keys.map(key => (verifiedClaim && key === "status" ? "FORMALIZED_UNVERIFIED" : row[key]) as string | number | null))
        // INSERT never permits KERNEL_VERIFIED. The guarded UPDATE checks the
        // actual proof/formal/verification rows already copied above.
        if (verifiedClaim) historical.query("UPDATE claims SET status='KERNEL_VERIFIED' WHERE id=?").run(row.id as string)
      }
    }
    historical.query("INSERT INTO mathos_meta(key,value) VALUES ('schema_epoch',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(epoch))
  } finally { historical.close() }
}

function researchSnapshot(path: string) {
  const db = new Database(path, { readonly: true })
  try {
    return Object.fromEntries(["claims", "formal_statements", "fidelity_reviews", "proof_attempts", "verification_runs", "statement_revisions", "formal_alignments", "events"].map(table => [table, db.query(`SELECT * FROM ${table} ORDER BY id`).all()]))
  } finally { db.close() }
}

test("a populated epoch-29 workspace preserves approvals, proofs, events and chat through upgrade and separate restore", async () => {
  const root = temporaryRoot(), created = await MathOS.init(root, "legacy")
  const provider = new FakeModelProvider()
  provider.enqueue({ declarationName: "legacy_identity", leanStatement: "theorem legacy_identity (n : Nat) : n = n", variableMapping: [], assumptionMapping: [], uncertainties: [] })
  provider.enqueue({ verdict: "MATCH", findings: [], naturalSummary: "n equals itself", formalBackTranslation: "n equals itself" })
  const app = MathOS.open(created.root, { modelProvider: provider, auditorProvider: provider, leanAdapter: new FakeLeanAdapter(), vcs: new FakeVcs() })
  let claimId: string
  try {
    claimId = app.createClaim({ kind: "lemma", title: "Persisted identity", statement: "Every natural number equals itself.", asMainObjective: true }).id
    const formal = await app.formalize(claimId)
    app.approveFormal(formal.formalStatement.id)
    await app.prove(claimId, undefined, { maxAttempts: 1, proofBody: "by rfl" })
  } finally { app.close() }
  const store = new AssistantStore(created.root), chat = store.create({ claimId })
  chat.title = "Preserved research discussion"
  chat.messages.push({ id: "msg_legacy", role: "user", createdAt: chat.createdAt, content: "Does the persisted proof still match this claim after upgrading?" })
  store.save(chat)
  const chatPath = join(created.root, ".mathos", "assistant", `${chat.id}.json`), chatBytes = readFileSync(chatPath)
  const path = join(created.root, ".mathos", "mathos.db"), snapshot = researchSnapshot(path)
  expect((snapshot.formal_alignments as unknown[]).length).toBeGreaterThan(0)
  expect((snapshot.proof_attempts as unknown[]).length).toBeGreaterThan(0)
  rebuildHistoricalSchema(path, 29)
  const historical = new Database(path, { readonly: true })
  try { expect(historical.query("SELECT name FROM sqlite_master WHERE name='plugin_records'").get()).toBeNull() } finally { historical.close() }
  const migrated = MathOS.open(created.root)
  try { expect(migrated.schemaEpoch()).toBe(SCHEMA_EPOCH); expect(migrated.getClaim(claimId).title).toBe("Persisted identity") } finally { migrated.close() }
  expect(researchSnapshot(path)).toEqual(snapshot)
  const backupNames = readdirSync(join(created.root, ".mathos", "backups"))
  expect(backupNames.some(name => name.startsWith("pre-migration-29-"))).toBe(true)
  const backup = backupWorkspace(created.root, join(root, "archives")), restored = restoreWorkspace(backup.archive, join(root, "restored"))
  const reopened = MathOS.open(restored.root)
  try { expect(reopened.getClaim(claimId).title).toBe("Persisted identity"); expect(reopened.claimWorkflow(claimId).approved).toBe(true) } finally { reopened.close() }
  expect(researchSnapshot(join(restored.root, ".mathos", "mathos.db"))).toEqual(snapshot)
  expect(readFileSync(join(restored.root, ".mathos", "assistant", `${chat.id}.json`))).toEqual(chatBytes)
})

test("the minimum supported epoch-16 preserves populated legacy research rows", () => {
  const root = temporaryRoot(), path = join(root, ".mathos", "mathos.db")
  mkdirSync(join(root, ".mathos"))
  const historical = new Database(path, { create: true })
  historical.exec("CREATE TABLE schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
  for (const migration of MIGRATIONS.slice(0, 16)) { historical.exec(migration.sql); historical.query("INSERT INTO schema_migrations VALUES (?, 'fixture')").run(migration.id) }
  historical.exec(`
    INSERT INTO workspaces VALUES ('W-1','Legacy research','fixture',NULL,'then','then');
    INSERT INTO branches(id,workspace_id,name,status,is_current,created_at,slug) VALUES ('B-000','W-1','MAIN','ACTIVE',1,'then','main');
    INSERT INTO claims(id,workspace_id,kind,title,natural_statement,status,branch_id,created_at,updated_at) VALUES ('L-1','W-1','lemma','Stored identity','n = n','FORMALIZED_UNVERIFIED','B-000','then','then');
    INSERT INTO formal_statements(id,workspace_id,claim_id,declaration_name,source_text,verification_status,fidelity_status,created_at,updated_at) VALUES ('FS-1','W-1','L-1','identity','theorem identity (n : Nat) : n = n','UNVERIFIED','AI_REVIEWED','then','then');
    INSERT INTO proof_attempts(id,workspace_id,claim_id,formal_statement_id,status,proof_source,attempt_number,created_at) VALUES ('PA-1','W-1','L-1','FS-1','INCONCLUSIVE','by rfl',1,'then');
    INSERT INTO events(id,workspace_id,timestamp,actor_type,actor_id,action,target,metadata_json) VALUES ('EV-1','W-1','then','user','researcher','claim.created','L-1','{"note":"keep this provenance"}');
    INSERT INTO mathos_meta(key,value) VALUES ('schema_epoch','16');
  `)
  const tables = ["claims", "formal_statements", "proof_attempts", "events"]
  const columns = new Map(tables.map(table => [table, historical.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all().map(row => row.name)]))
  const before = Object.fromEntries(tables.map(table => [table, historical.query(`SELECT ${columns.get(table)!.join(",")} FROM ${table} ORDER BY id`).all()]))
  historical.close()
  const current = new DatabaseClient(path)
  try {
    current.migrate()
    expect(current.schemaEpoch()).toBe(SCHEMA_EPOCH)
    for (const table of tables) expect(current.db.query(`SELECT ${columns.get(table)!.join(",")} FROM ${table} ORDER BY id`).all()).toEqual(before[table]!)
    expect(current.db.query("SELECT * FROM formal_alignments").all()).toEqual([])
  } finally { current.close() }
})

test("failure within a pending migration rolls back its schema and the pre-migration backup remains recoverable", async () => {
  const root = temporaryRoot(), created = await MathOS.init(root, "interrupted"), path = join(created.root, ".mathos", "mathos.db")
  const app = MathOS.open(created.root)
  try { app.createClaim({ kind: "lemma", title: "Survive interrupted migration", statement: "True" }) } finally { app.close() }
  rebuildHistoricalSchema(path, 29)
  const snapshot = researchSnapshot(path)
  const fault = new Database(path)
  fault.exec("CREATE TRIGGER fixture_migration_failure BEFORE INSERT ON schema_migrations WHEN NEW.id='030_plugins_and_projections' BEGIN SELECT RAISE(ABORT,'fixture migration interruption'); END")
  fault.close()
  const client = new DatabaseClient(path)
  try {
    expect(() => client.migrate()).toThrow("fixture migration interruption")
    expect(client.schemaEpoch()).toBe(29)
    expect(client.db.query("SELECT name FROM sqlite_master WHERE name='plugin_records'").get()).toBeNull()
    expect(client.db.query("SELECT name FROM sqlite_master WHERE name='projection_records'").get()).toBeNull()
  } finally { client.close() }
  expect(researchSnapshot(path)).toEqual(snapshot)
  const backupDirectory = join(created.root, ".mathos", "backups"), backupName = readdirSync(backupDirectory).find(name => name.startsWith("pre-migration-29-"))!
  expect(backupName).toBeTruthy()
  const recoveryPath = join(root, "recovered", ".mathos", "mathos.db")
  mkdirSync(join(root, "recovered", ".mathos"), { recursive: true })
  copyFileSync(join(backupDirectory, backupName), recoveryPath)
  const recovered = new DatabaseClient(recoveryPath)
  try { recovered.db.exec("DROP TRIGGER fixture_migration_failure"); recovered.migrate(); expect(recovered.schemaEpoch()).toBe(SCHEMA_EPOCH) } finally { recovered.close() }
  expect(researchSnapshot(recoveryPath)).toEqual(snapshot)
})

test("a blocked WAL checkpoint prevents migration instead of making an incomplete backup", async () => {
  const root = temporaryRoot(), created = await MathOS.init(root, "busy-backup"), path = join(created.root, ".mathos", "mathos.db")
  rebuildHistoricalSchema(path, 29)
  const client = new DatabaseClient(path), reader = new Database(path, { readonly: true })
  try {
    client.db.exec("PRAGMA busy_timeout=25")
    reader.exec("BEGIN")
    reader.query("SELECT COUNT(*) FROM events").get()
    const workspace = client.db.query<{ id: string }, []>("SELECT id FROM workspaces LIMIT 1").get()!
    client.db.query("INSERT INTO events(id,workspace_id,timestamp,actor_type,actor_id,action,target,metadata_json) VALUES ('EV-WAL',?,'now','user','researcher','fixture.wal',NULL,'{}')").run(workspace.id)
    expect(() => client.migrate()).toThrow("pre-migration checkpoint incomplete")
    expect(client.schemaEpoch()).toBe(29)
    expect(client.db.query("SELECT id FROM events WHERE id='EV-WAL'").get()).not.toBeNull()
    const backups = join(created.root, ".mathos", "backups")
    expect(existsSync(backups) ? readdirSync(backups) : []).toEqual([])
  } finally { reader.exec("ROLLBACK"); reader.close(); client.close() }
})

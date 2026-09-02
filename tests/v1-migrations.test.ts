import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseClient, MIGRATIONS, SCHEMA_EPOCH } from "@mathos/storage"

const roots:string[]=[]
const temporaryDatabase=()=>{const root=mkdtempSync(join(tmpdir(),"mathos-v1-migrate-"));roots.push(root);return join(root,"mathos.db")}
afterEach(()=>{for(const root of roots.splice(0)) rmSync(root,{recursive:true,force:true})})

const expectedTables=["context_items","context_revisions","research_documents","research_blocks","notebook_sync_records","statement_revisions","formal_alignments","alignment_findings","stale_markers","proof_portfolios","proof_jobs","proof_candidates","proof_repair_attempts","failure_fingerprints","failure_occurrences","solver_jobs","solver_results","source_document_pages","extraction_candidates","claim_source_assessments","conjecture_proposals","conjecture_triage_results","agenda_items","review_packets","review_findings","review_attestations","capsule_records","publication_records","plugin_records","projection_records"]

describe("MathOS v1 additive migrations",()=>{
  test("fresh database creates the professional research schema and is idempotent",()=>{
    const client=new DatabaseClient(temporaryDatabase());client.migrate();client.migrate()
    const tables=new Set(client.db.query<{name:string},[]>("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name))
    for(const table of expectedTables) expect(tables.has(table)).toBe(true)
    expect(client.schemaEpoch()).toBe(SCHEMA_EPOCH)
    expect(SCHEMA_EPOCH).toBe(30)
    client.close()
  })

  test("upgrades an epoch-16 workspace without dropping legacy tables",()=>{
    const path=temporaryDatabase();const db=new Database(path,{create:true})
    db.exec("CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
    for(const migration of MIGRATIONS.slice(0,16)){db.transaction(()=>{db.exec(migration.sql);db.query("INSERT INTO schema_migrations VALUES (?, 'fixture')").run(migration.id)})()}
    db.exec("CREATE TABLE IF NOT EXISTS mathos_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO mathos_meta VALUES ('schema_epoch','16')")
    db.close()
    const client=new DatabaseClient(path);client.migrate()
    expect(client.schemaEpoch()).toBe(30)
    expect(client.db.query("SELECT 1 FROM claims LIMIT 1").all()).toEqual([])
    expect(client.db.query("SELECT 1 FROM context_items LIMIT 1").all()).toEqual([])
    client.close()
  })

  test("transaction failure leaves no partial schema",()=>{
    const client=new DatabaseClient(temporaryDatabase())
    expect(()=>client.unitOfWork(()=>{client.db.exec("CREATE TABLE partial_v1(id TEXT)");throw new Error("synthetic migration failure")})).toThrow("synthetic migration failure")
    expect(client.db.query("SELECT name FROM sqlite_master WHERE name='partial_v1'").get()).toBeNull()
    client.close()
  })
})

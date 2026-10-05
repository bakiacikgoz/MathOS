import { expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { MathOS } from "@mathos/core"
import { ProofPortfolioRepository } from "@mathos/storage"

async function fixture(work: (app: MathOS, peer: Database) => void): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "mathos-write-contention-"))
  let app: MathOS | null = null, peer: Database | null = null
  try {
    const created = await MathOS.init(root, "preserved")
    app = MathOS.open(created.root)
    app["client"].db.exec("CREATE TABLE contention_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL); INSERT INTO contention_probe VALUES (0, 'preserved')")
    peer = new Database(join(created.root, ".mathos", "mathos.db"))
    peer.exec("PRAGMA busy_timeout = 0")
    work(app, peer)
    expect(app["client"].db.query("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" })
  } finally {
    try { peer?.close() }
    finally { app?.close() }
    const safe = resolve(root)
    if (dirname(safe) !== resolve(tmpdir()) || !basename(safe).startsWith("mathos-write-contention-")) throw new Error(`Unsafe contention fixture cleanup: ${safe}`)
    rmSync(safe, { recursive: true, force: true })
  }
}

// Schedule an actual WAL commit between the root transaction's read and write.
// The new writer reservation must block only that competing commit; it must
// become possible after the transaction ends, without losing either row.
function contendAfterRead<T>(db: Database, peer: Database, select: string, work: () => T): T {
  const originalQuery = db.query
  const restorers: Array<() => void> = []
  let reached = false, blocked = false
  db.query = ((sql: string) => {
    const statement = originalQuery.call(db, sql)
    if (sql === select) {
      const originalGet = statement.get
      statement.get = (...args: never[]) => {
        const row = originalGet.apply(statement, args)
        if (!reached && db.inTransaction) {
          reached = true
          try { peer.query("INSERT INTO contention_probe VALUES (1, 'concurrent')").run() }
          catch (error) { expect(error).toMatchObject({ code: "SQLITE_BUSY" }); blocked = true }
        }
        return row
      }
      restorers.push(() => { statement.get = originalGet })
    }
    return statement
  }) as typeof db.query
  let result: T
  try { result = work() }
  finally { db.query = originalQuery; for (const restore of restorers.reverse()) restore() }
  expect(reached).toBe(true)
  expect(blocked).toBe(true)
  peer.query("INSERT INTO contention_probe VALUES (1, 'concurrent')").run()
  expect(db.query("SELECT value FROM contention_probe ORDER BY id").all()).toEqual([{ value: "preserved" }, { value: "concurrent" }])
  return result
}

for (const existingCounter of [false, true]) {
  test(`claim ID allocation reserves the writer with ${existingCounter ? "an existing" : "a new"} counter`, async () => {
    await fixture((app, peer) => {
      if (existingCounter) expect(app.createClaim({ kind: "lemma", title: "Previous", naturalStatement: "True" }).id).toBe("L-001")
      const claim = contendAfterRead(app["client"].db, peer, "SELECT next_value FROM id_allocators WHERE prefix = ?", () => app.createClaim({ kind: "lemma", title: "Concurrent", naturalStatement: "True" }))
      expect(claim.id).toBe(existingCounter ? "L-002" : "L-001")
      expect(app.createClaim({ kind: "lemma", title: "Next", naturalStatement: "True" }).id).toBe(existingCounter ? "L-003" : "L-002")
      const ids = app.listClaims().map(item => item.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(app.eventProjectionHealth().status).toBe("HEALTHY")
    })
  })
}

test("root write unit reserves before reading even when the nested transaction is immediate, and rolls back domain/event changes", async () => {
  await fixture((app, peer) => {
    const client = app["client"], events = client.db.query("SELECT * FROM events ORDER BY id").all()
    contendAfterRead(client.db, peer, "SELECT value FROM contention_probe WHERE id = 0", () => {
      expect(() => client.unitOfWork(() => {
        client.db.query("SELECT value FROM contention_probe WHERE id = 0").get()
        client.db.transaction(() => client.db.query("UPDATE workspaces SET name = 'changed'").run()).immediate()
        client.db.query("UPDATE events SET action = 'rollback-probe'").run()
        throw new Error("rollback-probe")
      })).toThrow("rollback-probe")
    })
    expect(client.db.query("SELECT name FROM workspaces").get()).toEqual({ name: "preserved" })
    expect(client.db.query("SELECT * FROM events ORDER BY id").all()).toEqual(events)
  })
})

test("context activation preserves supersession and revision guards under a competing WAL writer", async () => {
  await fixture((app, peer) => {
    const contexts = app.services.mathematicalContext, scope = { workspaceId: "W-1", branchId: "B-1", scopeKind: "BRANCH" as const, scopeId: "B-1" }
    const draft = { kind: "SYMBOL" as const, canonicalName: "x", displayText: "x", normalizedValue: "x", origin: "USER" as const }
    const first = contexts.proposeItem({ ...scope, draft })
    contexts.applyProposal(first.id, first.revision)
    const next = contexts.proposeItem({ ...scope, draft: { ...draft, displayText: "next" } })
    const active = contendAfterRead(app["client"].db, peer, "SELECT * FROM context_items WHERE id = ?", () => app.services.repositories.contextItems.activateAndSupersede(next.id, next.revision))
    expect(active.status).toBe("ACTIVE")
    expect(active.revision).toBe(next.revision + 1)
    expect(app.services.repositories.contextItems.get(first.id)?.status).toBe("SUPERSEDED")
    expect(() => app.services.repositories.contextItems.activateAndSupersede(next.id, next.revision)).toThrow("REVISION_CONFLICT")
    expect(app.services.repositories.contextItems.get(next.id)).toEqual(active)
  })
})

test("portfolio winner selection preserves verified-candidate and revision guards under a competing WAL writer", async () => {
  await fixture((app, peer) => {
    const db = app["client"].db, portfolios = new ProofPortfolioRepository(db)
    // Repository fixtures exercise storage policy, not real kernel acceptance.
    portfolios.insert({ id: "PF-1", claimId: "C-1", formalStatementId: "F-1", formalRevisionHash: "hash", branchId: "B-1", status: "RUNNING", selectionPolicy: {}, limits: {}, usage: {}, revision: 1, createdAt: "2030-01-01" })
    app.services.repositories.proofJobs.insert({ id: "PJ-1", portfolioId: "PF-1", adapterId: "fixture", adapterVersion: "1", strategy: "fixture", status: "DONE", idempotencyKey: "fixture", budget: {}, createdAt: "2030-01-01" })
    app.services.repositories.proofCandidates.insert({ id: "PC-1", proofJobId: "PJ-1", sourceArtifactId: "fixture", normalizedProofHash: "hash", declarationHash: "hash", compileResult: "KERNEL_ACCEPTED", diagnostics: [], axioms: [], forbidden: [], status: "VERIFIED", score: 0, createdAt: "2030-01-01" })
    const winner = contendAfterRead(db, peer, "SELECT j.portfolio_id, c.status FROM proof_candidates c JOIN proof_jobs j ON j.id=c.proof_job_id WHERE c.id=?", () => portfolios.selectWinner("PF-1", "PC-1", 1))
    expect(winner.winnerCandidateId).toBe("PC-1")
    expect(winner.status).toBe("SUCCEEDED")
    expect(winner.revision).toBe(2)
    expect(() => portfolios.selectWinner("PF-1", "PC-1", 1)).toThrow("REVISION_CONFLICT")
    db.query("UPDATE proof_candidates SET status='REJECTED' WHERE id='PC-1'").run()
    expect(() => portfolios.selectWinner("PF-1", "PC-1", 2)).toThrow("INVALID_PORTFOLIO_WINNER")
    expect(portfolios.get("PF-1")).toEqual(winner)
  })
})

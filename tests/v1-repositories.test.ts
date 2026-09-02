import { afterEach, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { DatabaseClient } from "@mathos/storage"
import {
  ContextItemRepository,
  ProofCandidateRepository,
  ProofJobRepository,
  ProofPortfolioRepository,
  ResearchBlockRepository,
  V1StorageDecodeError,
} from "../packages/storage/src/index.ts"

const clients: DatabaseClient[] = []

function database(): DatabaseClient {
  const client = new DatabaseClient(join(tmpdir(), `mathos-v1-repos-${crypto.randomUUID()}.sqlite`))
  client.migrate()
  clients.push(client)
  return client
}

afterEach(() => {
  while (clients.length) clients.pop()!.close()
})

describe("MathOS v1 repositories", () => {
  test("round-trips JSON, orders deterministically, and paginates", () => {
    const client = database()
    const blocks = new ResearchBlockRepository(client.db)
    for (const [id, sequence] of [["RB-2", 2], ["RB-1", 1]] as const) {
      blocks.insert({ id, documentId: "D-1", parentBlockId: null, sequence, kind: "MARKDOWN", markdown: id, entityType: null, entityId: null, attributes: { sequence }, revision: 1, contentHash: id, createdAt: "2026-01-01", updatedAt: "2026-01-01" })
    }
    expect(blocks.list("D-1", { limit: 1, offset: 0 })).toEqual([
      expect.objectContaining({ id: "RB-1", attributes: { sequence: 1 } }),
    ])
    expect(blocks.get("RB-2")).toEqual(expect.objectContaining({ sequence: 2 }))
  })

  test("enforces unique constraints and optimistic revisions", () => {
    const client = database()
    const contexts = new ContextItemRepository(client.db)
    const item = { id: "CTX-1", workspaceId: "W-1", branchId: "B-1", scopeKind: "BRANCH", scopeId: "B-1", kind: "DEFINITION_REF", canonicalName: "x", displayText: "x", normalizedValue: "x", leanExpression: null, sourceClaimId: "C-1", status: "ACTIVE", origin: "USER", revision: 1, contentHash: "h1", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as const
    contexts.insert(item)
    expect(() => contexts.insert({ ...item, id: "CTX-2" })).toThrow()
    expect(contexts.updateExpectedRevision("CTX-1", 1, { displayText: "X", contentHash: "h2", updatedAt: "2026-01-02" })).toEqual(expect.objectContaining({ revision: 2, displayText: "X" }))
    expect(() => contexts.updateExpectedRevision("CTX-1", 1, { displayText: "stale" })).toThrow("REVISION_CONFLICT")
  })

  test("fails with a typed error when persisted JSON is corrupt", () => {
    const client = database()
    client.db.query("INSERT INTO research_blocks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("RB-1", "D-1", null, 1, "MARKDOWN", "x", null, null, "{", 1, "h", "2026-01-01", "2026-01-01")
    expect(() => new ResearchBlockRepository(client.db).get("RB-1")).toThrow(V1StorageDecodeError)
  })

  test("activates context and selects a portfolio winner atomically", () => {
    const client = database()
    const contexts = new ContextItemRepository(client.db)
    const base = { workspaceId: "W-1", branchId: "B-1", scopeKind: "BRANCH", scopeId: "B-1", kind: "SYMBOL", canonicalName: "x", displayText: "x", normalizedValue: "x", leanExpression: null, sourceClaimId: null, origin: "USER", revision: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01" } as const
    contexts.insert({ ...base, id: "CTX-1", status: "PROPOSED", contentHash: "h1" })
    contexts.insert({ ...base, id: "CTX-2", status: "PROPOSED", contentHash: "h2" })
    contexts.activateAndSupersede("CTX-1")
    contexts.activateAndSupersede("CTX-2")
    expect(contexts.get("CTX-1")?.status).toBe("SUPERSEDED")
    expect(contexts.get("CTX-2")?.status).toBe("ACTIVE")

    const portfolios = new ProofPortfolioRepository(client.db)
    portfolios.insert({ id: "PF-1", claimId: "C-1", formalStatementId: "F-1", formalRevisionHash: "fh", branchId: "B-1", status: "RUNNING", selectionPolicy: {}, limits: {}, usage: {}, retrievalIndexRevision: null, contextRevisionId: null, winnerCandidateId: null, revision: 1, createdAt: "2026-01-01", startedAt: null, stoppedAt: null, stopReason: null })
    new ProofJobRepository(client.db).insert({ id: "PJ-1", portfolioId: "PF-1", adapterId: "lean", adapterVersion: "1", strategy: "direct", workerBranchId: null, worktreePath: null, status: "DONE", idempotencyKey: "key", budget: {}, provider: null, model: null, promptHash: null, createdAt: "2026-01-01", startedAt: null, finishedAt: null, errorCode: null })
    const candidates = new ProofCandidateRepository(client.db)
    candidates.insert({ id: "PC-1", proofJobId: "PJ-1", sourceArtifactId: "A-1", normalizedProofHash: "ph", declarationHash: "dh", compileResult: "PASS", diagnostics: [], axioms: [], forbidden: [], verificationReportId: "VR-1", status: "VERIFIED", score: 1, createdAt: "2026-01-01" })
    portfolios.selectWinner("PF-1", "PC-1", 1)
    expect(portfolios.get("PF-1")).toEqual(expect.objectContaining({ status: "SUCCEEDED", winnerCandidateId: "PC-1", revision: 2 }))
  })
})

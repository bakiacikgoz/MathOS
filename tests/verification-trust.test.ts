import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, runVerificationGate } from "@mathos/core"
import type { Claim, FormalStatement, ProofAttempt } from "@mathos/domain"
import { ClaimRepository, DatabaseClient } from "@mathos/storage"
import { databasePath } from "@mathos/shared"

const timestamp = "2026-01-01T00:00:00.000Z"
const claim: Claim = {
  id: "T-001", workspaceId: "W-001", kind: "theorem", title: "T", naturalStatement: "True",
  originalInput: null, status: "FORMALIZED_UNVERIFIED", branchId: "B-000", createdBy: "user",
  provider: null, modelName: null, createdAt: timestamp, updatedAt: timestamp,
}
const formal: FormalStatement = {
  id: "F-001", workspaceId: "W-001", claimId: claim.id, language: "lean4", declarationName: "T",
  sourceText: "theorem T : True", filePath: null, isCurrent: true, verificationStatus: "ELABORATES",
  fidelityStatus: "HUMAN_APPROVED", createdBy: "user", provider: null, modelName: null,
  leanVersion: "4.19.0", createdAt: timestamp, updatedAt: timestamp,
}
const proof: ProofAttempt = {
  id: "P-001", workspaceId: "W-001", claimId: claim.id, formalStatementId: formal.id,
  status: "KERNEL_ACCEPTED", proofSource: "theorem T : True := by trivial", attemptNumber: 1,
  provider: null, modelName: null, leanVersion: "4.19.0", diagnostics: [], retrievalQuery: null,
  candidateNames: [], indexRevision: null, retrievalMode: null, retrievalProvenance: null, createdAt: timestamp,
}

function gate(overrides: Partial<Parameters<typeof runVerificationGate>[0]> = {}) {
  return runVerificationGate({
    claim, formal, proof, axioms: [], leanVersion: "4.19.0", toolchain: "leanprover/lean4:v4.19.0",
    compiled: true, currentRevision: true, ...overrides,
  })
}

describe("VerificationGate trust matrix", () => {
  test.each([
    ["sorry", { proof: { ...proof, proofSource: "theorem T : True := by sorry" } }],
    ["admit", { proof: { ...proof, proofSource: "theorem T : True := by admit" } }],
    ["unsafe", { proof: { ...proof, proofSource: "unsafe theorem T : True := by trivial" } }],
    ["custom axiom", { axioms: ["MathOS.untrusted"] }],
    ["stale formal", { currentRevision: false }],
    ["non-human fidelity", { formal: { ...formal, fidelityStatus: "AI_REVIEWED" } }],
    ["compile failure", { compiled: false }],
    ["bare stable toolchain", { toolchain: "stable" }],
    ["bare latest toolchain", { toolchain: "latest" }],
    ["qualified latest toolchain", { toolchain: "leanprover/lean4:latest" }],
    ["qualified stable toolchain", { toolchain: "leanprover/lean4:stable" }],
    ["floating nightly toolchain", { toolchain: "leanprover/lean4:nightly" }],
    ["branch toolchain", { toolchain: "leanprover/lean4:master" }],
    ["partial version toolchain", { toolchain: "leanprover/lean4:v4.33" }],
    ["missing toolchain", { toolchain: null }],
  ] as const)("rejects %s", (_name, overrides) => {
    const report = gate(overrides as Partial<Parameters<typeof runVerificationGate>[0]>)
    expect(report.passed).toBe(false)
    expect(report.claimStatus).not.toBe("KERNEL_VERIFIED")
  })

  test("accepts only when every check passes", () => {
    const report = gate()
    expect(report.checks.every((check) => check.status === "PASS")).toBe(true)
    expect(report.passed).toBe(true)
    expect(report.claimStatus).toBe("KERNEL_VERIFIED")
  })

  test.each(["leanprover/lean4:v4.33.1", "v4.33.1", "v4.34.0-rc1", "v4.34.0-rc.1", "leanprover/lean4:0123456789abcdef", "0123456789abcdef"])(
    "accepts immutable toolchain %s",
    (toolchain) => expect(gate({ toolchain }).passed).toBe(true),
  )
})

describe("KERNEL_VERIFIED assignment authority", () => {
  test("production writes are confined to VerificationGate, VerificationService, and the guarded storage sink", () => {
    const repoRoot = join(import.meta.dir, "..")
    const files = [join(repoRoot, "packages"), join(repoRoot, "apps")]
      .flatMap(walk)
      .filter((file) => /\.[cm]?[jt]sx?$/.test(file))
    const writePatterns = [
      /\b(?:status|claimStatus)\s*:[^\n]*["']KERNEL_VERIFIED["']/g,
      /\.updateStatus\([^\n]*["']KERNEL_VERIFIED["']/g,
      /\.verificationPromoter\.promote\(/g,
      /\.status\s*=\s*["']KERNEL_VERIFIED["']/g,
      /\.createClaim\([\s\S]{0,500}?status\s*:\s*["']KERNEL_VERIFIED["'][\s\S]{0,100}?\)/g,
      /\bUPDATE\b[^\n]{0,300}\bstatus\s*=\s*["']KERNEL_VERIFIED["']/gi,
      /\bINSERT\b[^\n]{0,300}\bVALUES\b[^\n]*["']KERNEL_VERIFIED["']/gi,
    ]
    const writes = files.flatMap((file) => {
      const source = readFileSync(file, "utf8")
      return writePatterns.flatMap((pattern) => [...source.matchAll(pattern)].map(() => file.slice(repoRoot.length + 1)))
    })
    expect(writes.sort()).toEqual([
      "packages/core/src/services/verification-service.ts",
      "packages/core/src/services/verification-service.ts",
      "packages/core/src/verify.ts",
      "packages/storage/src/migrations.ts",
      "packages/storage/src/migrations.ts",
      "packages/storage/src/repositories.ts",
    ])
    expect(files.some((file) => readFileSync(file, "utf8").includes("verification-authority"))).toBe(false)
  })
})

describe("ClaimRepository trust boundary", () => {
  test("rejects repository and raw SQL bypasses and downgrades unbacked legacy rows", async () => {
    const parent = mkdtempSync(join(tmpdir(), "mathos-storage-trust-"))
    try {
      const created = await MathOS.init(parent, "claims")
      const app = MathOS.open(created.root)
      const ordinary = app.createClaim({ kind: "lemma", title: "ordinary", statement: "True" })
      app.close()
      const client = new DatabaseClient(databasePath(created.root))
      client.migrate()
      const repository = new ClaimRepository(client.db)
      expect(() => repository.insert({ ...ordinary, id: "L-999", status: "KERNEL_VERIFIED" })).toThrow("VerificationGate")
      const aliasedUpdate = repository.updateStatus.bind(repository)
      expect(() => aliasedUpdate(ordinary.id, "KERNEL_VERIFIED", timestamp)).toThrow("VerificationGate")
      expect(() => client.db.query(
        `INSERT INTO claims (
          id, workspace_id, kind, title, natural_statement, original_input, status, branch_id,
          created_by, provider, model_name, created_at, updated_at
        ) SELECT 'L-998', workspace_id, kind, title, natural_statement, original_input, 'KERNEL_VERIFIED', branch_id,
          created_by, provider, model_name, created_at, updated_at FROM claims WHERE id = ?`,
      ).run(ordinary.id)).toThrow("VerificationGate evidence")
      expect(() => client.db.exec(`UPDATE claims SET status = 'KERNEL_VERIFIED' WHERE id = '${ordinary.id}'`)).toThrow("VerificationGate evidence")
      expect(() => client.db.query("UPDATE claims SET status = ? WHERE id = ?").run("KERNEL_VERIFIED", ordinary.id)).toThrow("VerificationGate evidence")
      client.db.exec("DROP TRIGGER claims_kernel_verified_insert_guard; DROP TRIGGER claims_kernel_verified_update_guard;")
      client.db.query("UPDATE claims SET status = 'KERNEL_VERIFIED' WHERE id = ?").run(ordinary.id)
      client.db.query("DELETE FROM schema_migrations WHERE id = '018_kernel_verification_integrity'").run()
      client.close()
      const reopened = MathOS.open(created.root)
      try { expect(reopened.getClaim(ordinary.id).status).toBe("FORMALIZED_UNVERIFIED") }
      finally { reopened.close() }
    } finally { rmSync(parent, { recursive: true, force: true }) }
  })
})

describe("public claim creation trust boundary", () => {
  test("cannot create a KERNEL_VERIFIED claim directly", async () => {
    const parent = mkdtempSync(join(tmpdir(), "mathos-trust-"))
    try {
      const created = await MathOS.init(parent, "claims")
      const app = MathOS.open(created.root)
      try {
        expect(() => app.createClaim({ kind: "lemma", title: "bypass", statement: "True", status: "KERNEL_VERIFIED" })).toThrow("VerificationGate")
        expect(app.listClaims()).toHaveLength(0)
      } finally { app.close() }
    } finally { rmSync(parent, { recursive: true, force: true }) }
  })
})

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

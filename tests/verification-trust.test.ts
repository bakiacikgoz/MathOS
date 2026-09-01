import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, runVerificationGate } from "@mathos/core"
import type { Claim, FormalStatement, ProofAttempt } from "@mathos/domain"

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
    ["unpinned toolchain", { toolchain: "stable" }],
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
})

describe("KERNEL_VERIFIED assignment authority", () => {
  test("production writes are confined to VerificationGate and VerificationService", () => {
    const root = join(import.meta.dir, "..", "packages", "core", "src")
    const files = walk(root).filter((file) => file.endsWith(".ts"))
    const writePatterns = [
      /\b(?:status|claimStatus)\s*:[^\n]*["']KERNEL_VERIFIED["']/g,
      /\.updateStatus\([^\n]*["']KERNEL_VERIFIED["']/g,
      /\.status\s*=\s*["']KERNEL_VERIFIED["']/g,
    ]
    const writes = files.flatMap((file) => {
      const source = readFileSync(file, "utf8")
      return writePatterns.flatMap((pattern) => [...source.matchAll(pattern)].map(() => file.slice(root.length + 1)))
    })
    expect(writes.sort()).toEqual([
      "services/verification-service.ts",
      "services/verification-service.ts",
      "verify.ts",
    ])
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

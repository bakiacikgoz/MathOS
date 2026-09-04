import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { MathOS, createDemoWorkspace, experimentTrustLabels, formatTypedUserError, formatInitReport, researchReportMarkdown, whyVerified } from "@mathos/core"
import type { Experiment } from "@mathos/domain"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { WorkspaceAlreadyInitialized } from "@mathos/shared"
import { runUxEval } from "../packages/core/src/ux-eval.ts"
import { createTestWorkspace } from "./helpers/create-test-workspace.ts"

describe("product ux v1", () => {
  test("fresh init and no overwrite", async () => {
    const workspace = createTestWorkspace("mathos-ux-t-")
    try {
      const created = await MathOS.init(workspace.root, "alpha")
      expect(formatInitReport(created.name, created.root)).toContain("Ready.")
      await expect(MathOS.init(created.root)).rejects.toBeInstanceOf(WorkspaceAlreadyInitialized)
    } finally {
      workspace.cleanup()
    }
  })

  test("demo reopen, why-verified, report labels", async () => {
    const workspace = createTestWorkspace("mathos-ux-d-")
    try {
      const created = await createDemoWorkspace(workspace.root, "demo")
      const app = MathOS.open(created.root, { vcs: new FakeVcs(), leanAdapter: new FakeLeanAdapter() })
      expect(app.reopenSummary()).toContain("WELCOME BACK")
      const home = app.workspaceHome()
      for (const label of ["Objective", "Epistemic status", "Research state", "Open blockers", "Last meaningful progress", "Environment readiness"]) expect(home).toContain(label)
      const lemma = app.listClaims().find((item) => item.status === "KERNEL_VERIFIED")
      expect(lemma).toBeTruthy()
      const why = app.whyClaim(lemma!.id)
      expect(why).toContain("WHY VERIFIED")
      expect(why).toContain("VerificationGate KERNEL_ACCEPTED")
      expect(why).toContain("Axiom audit")
      expect(app.claimPage(lemma!.id)).toContain("WHY VERIFIED")
      const unverified = app.listClaims().find((item) => item.status !== "KERNEL_VERIFIED")
      if (unverified) expect(app.claimPage(unverified.id)).toContain("WHY NOT VERIFIED")
      expect(app.literatureHome()).toContain("EXTERNAL SOURCE\nNOT A PROOF")
      const report = app.exportReport("md")
      expect(report.body).toContain("Computation ≠ proof")
      expect(report.body).toContain("Citation ≠ proof")
      app.close()
    } finally {
      workspace.cleanup()
    }
  }, 30000)

  test("report keeps current kernel provenance when a later diagnostic verification exists", async () => {
    const workspace = createTestWorkspace("mathos-ux-report-")
    let app: MathOS | undefined
    try {
      const created = await createDemoWorkspace(workspace.root, "demo")
      app = MathOS.open(created.root, { vcs: new FakeVcs(), leanAdapter: new FakeLeanAdapter() })
      app.setMainObjective(app.listClaims().find((item) => item.status === "KERNEL_VERIFIED")!.id)
      const state = app.productState()
      const accepted = state.snapshot.verifications.find((item) => item.result === "KERNEL_ACCEPTED")!
      state.snapshot.verifications.push({ ...accepted, id: "vr_later_diagnostic", result: "ELABORATES" })
      const report = researchReportMarkdown(state)
      expect(report).toContain(`${accepted.id} KERNEL_ACCEPTED`)
      expect(report).toContain("VerificationGate provenance included")
      expect(report).not.toContain("No VerificationGate PASS")
    } finally { app?.close(); workspace.cleanup() }
  })

  test("experiment trust labels are conditional and never imply proof", () => {
    const base = { origin: "USER_AUTHORED", status: "CREATED", sandboxMode: null, networkPolicy: null, executionPolicyVersion: null } as unknown as Experiment
    expect(experimentTrustLabels(base)).toEqual(["NOT A PROOF"])
    expect(experimentTrustLabels({ ...base, status: "SUCCEEDED", origin: "MODEL_GENERATED", sandboxMode: "seatbelt", networkPolicy: "NETWORK_DENY", executionPolicyVersion: "sandbox-v1" })).toEqual([
      "MODEL GENERATED CODE", "SANDBOXED", "NETWORK DENIED", "NOT A PROOF",
    ])
    expect(experimentTrustLabels({ ...base, status: "FAILED", sandboxMode: "seatbelt", networkPolicy: "NETWORK_DENY", executionPolicyVersion: "sandbox-v1" })).toEqual(["NOT A PROOF"])
    expect(experimentTrustLabels({ ...base, status: "BLOCKED", sandboxMode: "seatbelt", networkPolicy: "NETWORK_DENY", executionPolicyVersion: "sandbox-v1" })).toEqual(["NOT A PROOF"])
    expect(experimentTrustLabels({ ...base, status: "SUCCEEDED", sandboxMode: "unknown", networkPolicy: "NETWORK_DENY", executionPolicyVersion: "sandbox-v1" })).toEqual(["NETWORK DENIED", "NOT A PROOF"])
  })

  test("why verified rejects incomplete, failed, and stale persisted gate evidence", async () => {
    const workspace = createTestWorkspace("mathos-ux-gate-")
    try {
      const created = await createDemoWorkspace(workspace.root, "demo")
      const app = MathOS.open(created.root, { vcs: new FakeVcs(), leanAdapter: new FakeLeanAdapter() })
      const state = app.productState()
      const claim = state.snapshot.claims.find((item) => item.status === "KERNEL_VERIFIED")!
      const vr = state.snapshot.verifications.filter((item) => item.claimId === claim.id && item.result === "KERNEL_ACCEPTED").at(-1)!
      const original = { ...vr }
      vr.gateJson = "not-json"
      expect(whyVerified(state, claim.id)).toContain("WHY NOT VERIFIED")
      Object.assign(vr, original, { gateJson: JSON.stringify([{ name: "forbidden constructs", status: "FAIL", detail: "sorry" }]) })
      expect(whyVerified(state, claim.id)).toContain("× forbidden constructs")
      Object.assign(vr, original, { forbiddenJson: JSON.stringify(["sorry"]) })
      expect(whyVerified(state, claim.id)).toContain("× Forbidden constructs")
      Object.assign(vr, original, { axiomsJson: JSON.stringify(["propext"]) })
      expect(whyVerified(state, claim.id)).toContain("○ Axiom audit · used")
      expect(whyVerified(state, claim.id)).not.toContain("✓ Axiom audit [")
      Object.assign(vr, original, { formalStatementId: "FS-STALE" })
      expect(whyVerified(state, claim.id)).toContain("WHY NOT VERIFIED")
      app.close()
    } finally { workspace.cleanup() }
  })

  test("headless literature mutation and inspection paths retain trust labels", async () => {
    const workspace = createTestWorkspace("mathos-ux-headless-")
    try {
      const created = await createDemoWorkspace(workspace.root, "demo")
      const cli = join(import.meta.dir, "../apps/tui/src/cli.ts")
      for (const args of [["source", "inspect", "SRC-001"], ["source", "excerpts", "SRC-001"]]) {
        const result = Bun.spawnSync([process.execPath, "run", cli, ...args], { cwd: created.root, env: process.env })
        const output = result.stdout.toString()
        expect(result.exitCode).toBe(0)
        expect(output).toContain("EXTERNAL SOURCE\nNOT A PROOF")
      }
    } finally { workspace.cleanup() }
  })

  test("typed errors include code", () => {
    const text = formatTypedUserError(new Error("UNSUPPORTED_EXTRACTION")).text
    expect(text).toContain("Error code:")
  })

  test("ux eval scenarios pass", async () => {
    const rows = await runUxEval()
    const failed = rows.filter((row) => row.result === "FAIL")
    expect(failed).toEqual([])
  }, 40000)
})

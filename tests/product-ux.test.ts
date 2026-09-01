import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, createDemoWorkspace, experimentTrustLabels, formatTypedUserError, formatInitReport } from "@mathos/core"
import type { Experiment } from "@mathos/domain"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { WorkspaceAlreadyInitialized } from "@mathos/shared"
import { runUxEval } from "../packages/core/src/ux-eval.ts"

describe("product ux v1", () => {
  test("fresh init and no overwrite", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mathos-ux-t-"))
    try {
      const created = await MathOS.init(dir, "alpha")
      expect(formatInitReport(created.name, created.root)).toContain("Ready.")
      await expect(MathOS.init(created.root)).rejects.toBeInstanceOf(WorkspaceAlreadyInitialized)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("demo reopen, why-verified, report labels", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mathos-ux-d-"))
    try {
      const created = await createDemoWorkspace(dir, "demo")
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
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30000)

  test("experiment trust labels are conditional and never imply proof", () => {
    const base = { origin: "USER_AUTHORED", sandboxMode: null, networkPolicy: null } as Experiment
    expect(experimentTrustLabels(base)).toEqual(["NOT A PROOF"])
    expect(experimentTrustLabels({ ...base, origin: "MODEL_GENERATED", sandboxMode: "seatbelt", networkPolicy: "NETWORK_DENY" })).toEqual([
      "MODEL GENERATED CODE", "SANDBOXED", "NETWORK DENIED", "NOT A PROOF",
    ])
    expect(experimentTrustLabels({ ...base, origin: "TRUSTED_BUILTIN", sandboxMode: "seatbelt", networkPolicy: "NETWORK_ALLOW" })).toEqual(["SANDBOXED", "NOT A PROOF"])
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

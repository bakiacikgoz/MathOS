import { describe, expect, test } from "bun:test"
import {
  buildResearchGraph,
  buildGraphContextSummary,
  canonicalGraphFixture,
  branchIsolationFixture,
  importGraphFixture,
  visibleExplorerNodes,
  initialExplorer,
  syntheticGraphSnapshot,
} from "@mathos/graph"
import { MathOS } from "@mathos/core"
import { FakeVcs } from "@mathos/vcs"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("graph context summary", () => {
  test("planner context lists frontier, support, failures, blockers", () => {
    const graph = buildResearchGraph(canonicalGraphFixture(), { branchId: "B-000" })
    const summary = buildGraphContextSummary(graph, { focusClaimId: "T-001" })
    expect(summary.verifiedPrerequisites.map((item) => item.id)).toContain("L-001")
    expect(summary.unverifiedFrontier.map((item) => item.id).sort()).toEqual(expect.arrayContaining(["L-003"]))
    expect(summary.recentFailedProofRoutes.some((item) => item.claimId === "L-002" && item.failureClass.includes("TYPE_MISMATCH"))).toBe(true)
    expect(summary.openBlockingChain.some((item) => item.chain.includes("BL-002") && item.chain.includes("T-001"))).toBe(true)
    expect(summary.notes.some((note) => note.includes("not imply the objective is verified"))).toBe(true)
    expect(summary.graphContextHash).toHaveLength(64)
  })

  test("context hash is deterministic", () => {
    const graph = buildResearchGraph(canonicalGraphFixture(), { branchId: "B-000" })
    const a = buildGraphContextSummary(graph, { focusClaimId: "T-001" })
    const b = buildGraphContextSummary(graph, { focusClaimId: "T-001" })
    expect(a.graphContextHash).toBe(b.graphContextHash)
    expect(a.graphRevision).toBe(b.graphRevision)
  })

  test("branch context isolation", () => {
    const b4 = buildGraphContextSummary(buildResearchGraph(branchIsolationFixture(), { branchId: "B-004" }), { focusClaimId: "T-001" })
    const b5 = buildGraphContextSummary(buildResearchGraph(branchIsolationFixture(), { branchId: "B-005" }), { focusClaimId: "T-001" })
    expect(b4.directDependents.concat(b4.directDependencies).some((item) => item.id === "L-020")).toBe(false)
    const g4 = buildResearchGraph(branchIsolationFixture(), { branchId: "B-004" })
    expect(g4.nodes.some((node) => node.id === "L-010")).toBe(true)
    expect(g4.nodes.some((node) => node.id === "L-020")).toBe(false)
    expect(b5.graphRevision).not.toBe(b4.graphRevision)
  })

  test("import support is target-only", () => {
    const graph = buildResearchGraph(importGraphFixture())
    const summary = buildGraphContextSummary(graph, { focusClaimId: "T-001" })
    expect(summary.importedDependencies.some((item) => item.targetClaimId === "L-044" && item.sourceClaimId === "L-021")).toBe(true)
    expect(summary.verifiedPrerequisites.some((item) => item.id === "L-021")).toBe(false)
  })

  test("fidelity mismatch is marked blocked", () => {
    const snap = canonicalGraphFixture()
    snap.formals[0] = { ...snap.formals[0]!, claimId: "T-001", fidelityStatus: "REJECTED", isCurrent: true }
    const summary = buildGraphContextSummary(buildResearchGraph(snap, { branchId: "B-000" }), { focusClaimId: "T-001" })
    expect(summary.fidelity?.blocked).toBe(true)
  })

  test("explorer search and filters", () => {
    const graph = buildResearchGraph(canonicalGraphFixture(), { branchId: "B-000" })
    const verified = visibleExplorerNodes(graph, { ...initialExplorer(graph), filter: "verified" })
    expect(verified.every((node) => node.epistemicStatus === "KERNEL_VERIFIED" || node.epistemicStatus === "INDEPENDENTLY_CHECKED")).toBe(true)
    const blockers = visibleExplorerNodes(graph, { ...initialExplorer(graph), filter: "blockers" })
    expect(blockers.some((node) => node.id === "BL-002" || node.epistemicStatus === "BLOCKED")).toBe(true)
    const search = visibleExplorerNodes(graph, { ...initialExplorer(graph), filter: "all", query: "L-001" })
    expect(search.some((node) => node.id === "L-001")).toBe(true)
    const local = visibleExplorerNodes(graph, { ...initialExplorer(graph), filter: "branch-local" })
    expect(local.every((node) => !node.origin || node.origin === "LOCAL")).toBe(true)
  })

  test("1k context build stays compact", () => {
    const graph = buildResearchGraph(syntheticGraphSnapshot(1000))
    const started = Date.now()
    const summary = buildGraphContextSummary(graph)
    expect(Date.now() - started).toBeLessThan(500)
    expect(summary.directDependencies.length).toBeLessThanOrEqual(12)
    expect(summary.unverifiedFrontier.length).toBeLessThanOrEqual(12)
  })
})

describe("mathos research context", () => {
  test("researchContext and progress are structural", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mathos-gctx-"))
    try {
      const created = await MathOS.init(dir, "gctx")
      const app = MathOS.open(created.root, { vcs: new FakeVcs() })
      const t = app.createClaim({ kind: "theorem", title: "T", statement: "P", asMainObjective: true, status: "FORMALIZED_UNVERIFIED" })
      const l1 = app.createClaim({ kind: "lemma", title: "L1", statement: "Q", status: "KERNEL_VERIFIED" })
      const l2 = app.createClaim({ kind: "lemma", title: "L2", statement: "R", status: "FORMALIZED_UNVERIFIED" })
      app.addDependency(t.id, l1.id)
      app.addDependency(t.id, l2.id)
      const ctx = app.researchContext()
      expect(ctx.summary.verifiedPrerequisites.some((item) => item.id === l1.id)).toBe(true)
      expect(ctx.summary.unverifiedFrontier.some((item) => item.id === l2.id)).toBe(true)
      const progress = app.researchProgress()
      expect(progress).toContain("Structural frontier")
      expect(progress.includes("%")).toBe(false)
      const child = await app.createBranch("other")
      app.switchBranch(child.id)
      const leaked = app.createClaim({ kind: "lemma", title: "secret", statement: "S" })
      app.switchBranch("B-000")
      const mainCtx = app.researchContext()
      expect(mainCtx.graph.nodes.some((node) => node.id === leaked.id)).toBe(false)
      app.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

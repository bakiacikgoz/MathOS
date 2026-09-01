import { describe, expect, test } from "bun:test"
import {
  buildResearchGraph,
  blockingChain,
  canonicalGraphFixture,
  cycleGraphFixture,
  branchIsolationFixture,
  importGraphFixture,
  syntheticGraphSnapshot,
  dependenciesOf,
  dependentsOf,
  pathBetween,
  unverifiedFrontier,
  orphanClaims,
  dependencyCycles,
  topologicalClaims,
  staleImpact,
  validateResearchGraph,
  formatGraphDot,
  formatGraphJson,
  formatGraphTree,
  formatClaimDetail,
  initialExplorer,
  visibleExplorerNodes,
  moveSelection,
  toProofGraph,
} from "@mathos/graph"
import { MathOS } from "@mathos/core"
import { FakeVcs } from "@mathos/vcs"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("research graph projection", () => {
  test("canonical fixture nodes, edges, frontier, blockers, path", () => {
    const graph = buildResearchGraph(canonicalGraphFixture(), { branchId: "B-000" })
    expect(graph.nodes.some((node) => node.id === "T-001" && node.kind === "OBJECTIVE")).toBe(true)
    expect(graph.nodes.find((node) => node.id === "L-001")?.epistemicStatus).toBe("KERNEL_VERIFIED")
    expect(graph.nodes.find((node) => node.id === "L-001")?.formalizationFidelity).toBe("HUMAN_APPROVED")
    expect(dependenciesOf(graph, "T-001").sort()).toEqual(["L-001", "L-002", "L-003"])
    expect(dependentsOf(graph, "L-001")).toEqual(["T-001"])
    expect(pathBetween(graph, "L-001", "T-001")).toEqual(["L-001", "T-001"])
    expect(unverifiedFrontier(graph, "T-001")).toContain("L-003")
    expect(blockingChain(graph, "BL-002")).toEqual(expect.arrayContaining(["BL-002", "L-003", "L-002", "T-001"]))
    expect(graph.nodes.some((node) => node.id === "PA-003")).toBe(true)
    expect(graph.nodes.some((node) => node.id === "VR-011")).toBe(true)
    const proof = toProofGraph(graph)
    expect(proof.objective).toBe("T-001")
    expect(formatGraphTree(graph, "T-001")).toContain("T-001")
    expect(formatGraphDot(graph)).toContain("DEPENDS_ON")
    expect(formatGraphJson(graph)).toContain("research-graph-v1")
    expect(formatClaimDetail(graph, "L-002")).toContain("TYPE_MISMATCH")
    const explorer = initialExplorer(graph)
    const nodes = visibleExplorerNodes(graph, explorer)
    expect(moveSelection(nodes, "T-001", 1)).toBeTruthy()
  })

  test("cycle detection and no silent break", () => {
    const graph = buildResearchGraph(cycleGraphFixture())
    const cycles = dependencyCycles(graph)
    expect(cycles.length).toBeGreaterThan(0)
    expect(validateResearchGraph(graph).issues.some((item) => item.code === "DEPENDENCY_CYCLE")).toBe(true)
    expect(topologicalClaims(graph)).toBeNull()
  })

  test("branch isolation", () => {
    const b4 = buildResearchGraph(branchIsolationFixture(), { branchId: "B-004" })
    const b5 = buildResearchGraph(branchIsolationFixture(), { branchId: "B-005" })
    const main = buildResearchGraph(branchIsolationFixture(), { branchId: "B-000" })
    expect(b4.nodes.map((node) => node.id)).toContain("L-010")
    expect(b4.nodes.map((node) => node.id)).not.toContain("L-020")
    expect(b5.nodes.map((node) => node.id)).toContain("L-020")
    expect(b5.nodes.map((node) => node.id)).not.toContain("L-010")
    expect(main.nodes.map((node) => node.id)).not.toContain("L-010")
    expect(main.nodes.map((node) => node.id)).not.toContain("L-020")
  })

  test("import provenance keeps separate verifications", () => {
    const graph = buildResearchGraph(importGraphFixture())
    expect(graph.edges.some((edge) => edge.kind === "IMPORTS_FROM" && edge.fromNodeId === "L-044" && edge.toNodeId === "L-021")).toBe(true)
    expect(graph.nodes.filter((node) => node.kind === "VERIFICATION").map((node) => node.id).sort()).toEqual(["VR-SRC", "VR-TGT"])
  })

  test("orphan and stale impact", () => {
    const snapshot = canonicalGraphFixture()
    snapshot.claims.push({
      id: "L-099",
      workspaceId: "ws",
      kind: "lemma",
      title: "orphan",
      naturalStatement: "x",
      originalInput: null,
      status: "CONJECTURE",
      branchId: "B-000",
      createdBy: "user",
      provider: null,
      modelName: null,
      createdAt: "t",
      updatedAt: "t",
    })
    snapshot.visibility.push({ branchId: "B-000", claimId: "L-099", relation: "LOCAL" })
    const graph = buildResearchGraph(snapshot, { branchId: "B-000" })
    expect(orphanClaims(graph)).toContain("L-099")
    expect(staleImpact(graph, "L-003")).toEqual(expect.arrayContaining(["L-002", "T-001"]))
  })

  test("deterministic rebuild hash", () => {
    const a = buildResearchGraph(canonicalGraphFixture(), { branchId: "B-000" })
    const b = buildResearchGraph(canonicalGraphFixture(), { branchId: "B-000" })
    expect(a.metadata.graphHash).toBe(b.metadata.graphHash)
    expect(a.nodes.map((node) => node.id)).toEqual(b.nodes.map((node) => node.id))
  })

  test("1k synthetic graph builds and queries", () => {
    const started = Date.now()
    const graph = buildResearchGraph(syntheticGraphSnapshot(1000))
    const buildMs = Date.now() - started
    expect(graph.nodes.length).toBeGreaterThan(900)
    const q0 = Date.now()
    expect(dependenciesOf(graph, "C-0500").length).toBeGreaterThan(0)
    dependentsOf(graph, "C-0001")
    unverifiedFrontier(graph)
    dependencyCycles(graph)
    const queryMs = Date.now() - q0
    expect(buildMs).toBeLessThan(2000)
    expect(queryMs).toBeLessThan(2000)
  })
})

describe("mathos graph integration", () => {
  test("workspace graph, isolation and CLI-shaped queries", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mathos-graph-"))
    try {
      const created = await MathOS.init(dir, "g")
      const app = MathOS.open(created.root, { vcs: new FakeVcs() })
      const t = app.createClaim({ kind: "theorem", title: "T", statement: "P", asMainObjective: true, status: "FORMALIZED_UNVERIFIED" })
      const l1 = app.createClaim({ kind: "lemma", title: "L1", statement: "Q", status: "INDEPENDENTLY_CHECKED" })
      const l2 = app.createClaim({ kind: "lemma", title: "L2", statement: "R", status: "FORMALIZED_UNVERIFIED" })
      app.addDependency(t.id, l1.id)
      app.addDependency(t.id, l2.id)
      const tree = app.graphShow(t.id)
      expect(tree).toContain(t.id)
      expect(app.graphDependencies(t.id).some((row) => row.includes(l1.id))).toBe(true)
      expect(app.graphPath(l1.id, t.id)).toEqual([l1.id, t.id])
      const child = await app.createBranch("alt")
      app.switchBranch(child.id)
      const local = app.createClaim({ kind: "lemma", title: "local", statement: "S" })
      const childGraph = app.buildGraph({ branchId: child.id })
      expect(childGraph.nodes.some((node) => node.id === local.id)).toBe(true)
      app.switchBranch("B-000")
      const mainGraph = app.buildGraph({ branchId: "B-000" })
      expect(mainGraph.nodes.some((node) => node.id === local.id)).toBe(false)
      const cmp = app.graphCompare("B-000", child.id)
      expect(cmp.onlyRight).toContain(local.id)
      expect(app.graphShow(t.id, { format: "dot" })).toContain("digraph")
      expect(JSON.parse(app.graphShow(t.id, { format: "json" })).schemaVersion).toBe("research-graph-v1")
      const doctor = await app.doctor()
      expect(doctor.checks.some((item) => item.name === "Research graph")).toBe(true)
      app.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

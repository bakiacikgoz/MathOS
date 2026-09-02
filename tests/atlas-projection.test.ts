import { describe, expect, test } from "bun:test"
import { projectAtlas, changesSince } from "../packages/graph/src/atlas-projection.ts"
import { computeCoverage } from "../packages/graph/src/coverage.ts"
import { blockerCriticalPath } from "../packages/graph/src/critical-path.ts"

const graph = { nodes: [{ id: "C1", kind: "OBJECTIVE", workspaceId: "W", entityId: "C1", label: "One", epistemicStatus: "KERNEL_VERIFIED" }, { id: "C2", kind: "CLAIM", workspaceId: "W", entityId: "C2", label: "Two", epistemicStatus: "DRAFT" }, { id: "F1", kind: "FORMAL_STATEMENT", workspaceId: "W", entityId: "F1", label: "formal" }, { id: "S1", kind: "SOURCE", workspaceId: "W", entityId: "S1", label: "source" }], edges: [{ id: "e1", kind: "DEPENDS_ON", fromNodeId: "C1", toNodeId: "C2", workspaceId: "W" }, { id: "e2", kind: "FORMALIZES", fromNodeId: "F1", toNodeId: "C1", workspaceId: "W" }, { id: "e3", kind: "SUPPORTED_BY_SOURCE", fromNodeId: "C1", toNodeId: "S1", workspaceId: "W" }], metadata: { schemaVersion: "research-graph-v1", workspaceId: "W", branchId: null, builtAt: "2030", eventSequence: 7, graphHash: "stable", focusNodeId: "C1" } } as any

describe("atlas projection", () => {
  test("is compact, stable, sequence-bound, and filterable", () => { const a = projectAtlas(graph); const b = projectAtlas(graph); expect(a.hash).toBe(b.hash); expect(a.eventSequence).toBe(7); expect(JSON.stringify(a)).not.toContain("proofBody"); expect(projectAtlas(graph, { statuses: ["DRAFT"] }).nodes.map((n) => n.id)).toContain("C2") })
  test("counts professional coverage metrics", () => { expect(computeCoverage(graph)).toMatchObject({ claimsTotal: 2, formalized: 1, verified: 1, sourceBacked: 1, orphan: 1 }) })
  test("critical path terminates cycles", () => { const cyclic = { ...graph, edges: [...graph.edges, { id: "e4", kind: "DEPENDS_ON", fromNodeId: "C2", toNodeId: "C1", workspaceId: "W" }] } as any; expect(blockerCriticalPath(cyclic, "C1").cycleDetected).toBe(true) })
  test("incremental changes summarize create update remove and gaps demand refresh", () => { const next = projectAtlas({ ...graph, nodes: [...graph.nodes.slice(0, -1), { ...graph.nodes[1], id: "C3", entityId: "C3" }], metadata: { ...graph.metadata, eventSequence: 8 } } as any); const delta = changesSince(projectAtlas(graph), next, 7); expect(delta.fullRefresh).toBe(false); expect(delta.created.length + delta.updated.length + delta.removed.length).toBeGreaterThan(0); expect(changesSince(projectAtlas(graph), next, 2).fullRefresh).toBe(true) })
})

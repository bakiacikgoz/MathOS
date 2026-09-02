import { expect, test } from "bun:test"
import { projectAtlas } from "@mathos/graph"

test("projects a 10k-node graph into a bounded deterministic snapshot", () => {
  const nodes = Array.from({ length: 10_000 }, (_, i) => ({ id: `C${i}`, entityId: `C${i}`, workspaceId: "W", kind: "CLAIM", label: `Claim ${i}`, epistemicStatus: i % 5 === 0 ? "KERNEL_VERIFIED" : "DRAFT" }))
  const edges = Array.from({ length: 9_999 }, (_, i) => ({ id: `E${i}`, workspaceId: "W", kind: "DEPENDS_ON", fromNodeId: `C${i + 1}`, toNodeId: `C${i}` }))
  const graph = { nodes, edges, metadata: { workspaceId: "W", eventSequence: 1, graphHash: "large", builtAt: "2030" } } as any
  const started = performance.now()
  const snapshot = projectAtlas(graph)
  expect(snapshot.nodes).toHaveLength(10_000)
  expect(snapshot.edges).toHaveLength(9_999)
  expect(performance.now() - started).toBeLessThan(2_000)
})

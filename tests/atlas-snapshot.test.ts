import { expect, test } from "bun:test"
import { projectAtlas } from "@mathos/graph"

test("Atlas snapshot carries revision metadata and inspector-safe summaries", () => {
  const graph = { nodes: [{ id: "C1", kind: "CLAIM", workspaceId: "W", entityId: "C1", label: "Claim", epistemicStatus: "BLOCKED", metadata: { branchId: "B1", secret: "canary" } }], edges: [], metadata: { workspaceId: "W", eventSequence: 4, graphHash: "rev-4", builtAt: "2030-01-01T00:00:00.000Z", focusNodeId: "C1" } } as any
  const snapshot = projectAtlas(graph)
  expect(snapshot.workspaceRevision).toBe("rev-4")
  expect(snapshot.generatedAt).toBe("2030-01-01T00:00:00.000Z")
  expect(snapshot.summaries).toMatchObject({ nodes: 1, edges: 0, blocked: 1 })
  expect(JSON.stringify(snapshot)).not.toContain("canary")
})

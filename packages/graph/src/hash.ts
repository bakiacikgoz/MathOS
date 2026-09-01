import { createHash } from "node:crypto"
import type { ResearchGraphEdge, ResearchGraphNode } from "./types.ts"

export function semanticGraphHash(nodes: ResearchGraphNode[], edges: ResearchGraphEdge[]): string {
  const payload = {
    nodes: [...nodes].sort((a, b) => a.id.localeCompare(b.id)).map((node) => ({
      id: node.id,
      kind: node.kind,
      entityId: node.entityId,
      epistemicStatus: node.epistemicStatus ?? null,
      formalizationFidelity: node.formalizationFidelity ?? null,
      origin: node.origin ?? null,
    })),
    edges: [...edges].sort((a, b) => a.id.localeCompare(b.id)).map((edge) => ({
      id: edge.id,
      kind: edge.kind,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
    })),
  }
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex")
}

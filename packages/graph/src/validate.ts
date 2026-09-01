import type { GraphValidationReport, ResearchGraph } from "./types.ts"
import { dependencyCycles } from "./analysis.ts"

export function validateResearchGraph(graph: ResearchGraph): GraphValidationReport {
  const issues: GraphValidationReport["issues"] = []
  const nodeIds = new Set<string>()
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) issues.push({ code: "DUPLICATE_NODE", message: node.id, nodeId: node.id })
    nodeIds.add(node.id)
  }
  const edgeIds = new Set<string>()
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) issues.push({ code: "DUPLICATE_EDGE", message: edge.id, edgeId: edge.id })
    edgeIds.add(edge.id)
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      issues.push({ code: "DANGLING_EDGE", message: edge.id, edgeId: edge.id })
    }
    if (edge.kind === "DEPENDS_ON" && edge.fromNodeId === edge.toNodeId) {
      issues.push({ code: "SELF_DEPENDENCY", message: edge.fromNodeId, edgeId: edge.id })
    }
  }
  for (const node of graph.nodes) {
    if (node.kind === "VERIFICATION" && !graph.edges.some((edge) => edge.kind === "VERIFIES" && edge.fromNodeId === node.id)) {
      issues.push({ code: "VERIFICATION_WITHOUT_CLAIM", message: node.id, nodeId: node.id })
    }
    if (node.kind === "PROOF_ATTEMPT" && !graph.edges.some((edge) => edge.kind === "PROOF_ATTEMPT_FOR" && edge.fromNodeId === node.id)) {
      issues.push({ code: "PROOF_WITHOUT_TARGET", message: node.id, nodeId: node.id })
    }
  }
  const cycles = dependencyCycles(graph)
  if (cycles.length) issues.push({ code: "DEPENDENCY_CYCLE", message: cycles.map((cycle) => cycle.join("→")).join("; ") })
  return { ok: issues.length === 0, issues, cycles }
}

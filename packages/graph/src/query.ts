import type { ResearchGraph, ResearchGraphEdge, ResearchGraphNode } from "./types.ts"

export function claimNodes(graph: ResearchGraph): ResearchGraphNode[] {
  return graph.nodes.filter((node) => node.kind === "CLAIM" || node.kind === "OBJECTIVE")
}

export function outgoing(graph: ResearchGraph, fromId: string, kind = "DEPENDS_ON"): ResearchGraphEdge[] {
  return graph.edges.filter((edge) => edge.fromNodeId === fromId && edge.kind === kind)
}

export function incoming(graph: ResearchGraph, toId: string, kind = "DEPENDS_ON"): ResearchGraphEdge[] {
  return graph.edges.filter((edge) => edge.toNodeId === toId && edge.kind === kind)
}

export function dependenciesOf(graph: ResearchGraph, claimId: string): string[] {
  return outgoing(graph, claimId).map((edge) => edge.toNodeId).sort()
}

export function dependentsOf(graph: ResearchGraph, claimId: string): string[] {
  return incoming(graph, claimId).map((edge) => edge.fromNodeId).sort()
}

export function blockersOf(graph: ResearchGraph, claimId: string): ResearchGraphNode[] {
  return graph.edges
    .filter((edge) => edge.kind === "BLOCKS" && edge.toNodeId === claimId)
    .map((edge) => graph.nodes.find((node) => node.id === edge.fromNodeId))
    .filter((node): node is ResearchGraphNode => Boolean(node))
}

export function proofAttemptsOf(graph: ResearchGraph, claimId: string): ResearchGraphNode[] {
  return graph.edges
    .filter((edge) => edge.kind === "PROOF_ATTEMPT_FOR" && edge.toNodeId === claimId)
    .map((edge) => graph.nodes.find((node) => node.id === edge.fromNodeId))
    .filter((node): node is ResearchGraphNode => Boolean(node))
}

export function verificationOf(graph: ResearchGraph, claimId: string): ResearchGraphNode[] {
  return graph.edges
    .filter((edge) => edge.kind === "VERIFIES" && edge.toNodeId === claimId)
    .map((edge) => graph.nodes.find((node) => node.id === edge.fromNodeId))
    .filter((node): node is ResearchGraphNode => Boolean(node))
}

export function pathBetween(graph: ResearchGraph, fromId: string, toId: string): string[] | null {
  if (fromId === toId) return [fromId]
  const adj = new Map<string, string[]>()
  for (const edge of graph.edges.filter((item) => item.kind === "DEPENDS_ON")) {
    adj.set(edge.fromNodeId, [...(adj.get(edge.fromNodeId) ?? []), edge.toNodeId])
    adj.set(edge.toNodeId, [...(adj.get(edge.toNodeId) ?? []), edge.fromNodeId])
  }
  const queue = [fromId]
  const prev = new Map<string, string | null>([[fromId, null]])
  while (queue.length) {
    const cur = queue.shift()!
    for (const next of (adj.get(cur) ?? []).sort()) {
      if (prev.has(next)) continue
      prev.set(next, cur)
      if (next === toId) {
        const path = [toId]
        let walk: string | null = toId
        while (walk && walk !== fromId) {
          walk = prev.get(walk) ?? null
          if (walk) path.push(walk)
        }
        return path.reverse()
      }
      queue.push(next)
    }
  }
  return null
}

export function neighborhood(graph: ResearchGraph, focusId: string, depth: number): { nodes: ResearchGraphNode[]; edges: ResearchGraphEdge[] } {
  const keep = new Set<string>([focusId])
  let frontier = [focusId]
  for (let i = 0; i < depth; i += 1) {
    const next: string[] = []
    for (const id of frontier) {
      for (const edge of graph.edges) {
        if (edge.fromNodeId === id && !keep.has(edge.toNodeId)) {
          keep.add(edge.toNodeId)
          next.push(edge.toNodeId)
        }
        if (edge.toNodeId === id && !keep.has(edge.fromNodeId)) {
          keep.add(edge.fromNodeId)
          next.push(edge.fromNodeId)
        }
      }
    }
    frontier = next
  }
  return {
    nodes: graph.nodes.filter((node) => keep.has(node.id)),
    edges: graph.edges.filter((edge) => keep.has(edge.fromNodeId) && keep.has(edge.toNodeId)),
  }
}

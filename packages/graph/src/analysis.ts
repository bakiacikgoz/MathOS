import type { ResearchGraph } from "./types.ts"
import { claimNodes, dependentsOf, dependenciesOf } from "./query.ts"

const VERIFIED = new Set(["KERNEL_VERIFIED", "INDEPENDENTLY_CHECKED"])

export function dependencyCycles(graph: ResearchGraph): string[][] {
  const claims = new Set(claimNodes(graph).map((node) => node.id))
  const adj = new Map<string, string[]>()
  for (const id of claims) adj.set(id, [])
  for (const edge of graph.edges.filter((item) => item.kind === "DEPENDS_ON")) {
    if (claims.has(edge.fromNodeId) && claims.has(edge.toNodeId)) adj.get(edge.fromNodeId)!.push(edge.toNodeId)
  }
  const cycles: string[][] = []
  const color = new Map<string, number>()
  const stack: string[] = []
  const visit = (id: string) => {
    color.set(id, 1)
    stack.push(id)
    for (const next of adj.get(id) ?? []) {
      const state = color.get(next) ?? 0
      if (state === 0) visit(next)
      else if (state === 1) {
        const start = stack.indexOf(next)
        if (start >= 0) cycles.push(stack.slice(start).concat(next))
      }
    }
    stack.pop()
    color.set(id, 2)
  }
  for (const id of [...claims].sort()) if ((color.get(id) ?? 0) === 0) visit(id)
  return cycles
}

export function topologicalClaims(graph: ResearchGraph): string[] | null {
  if (dependencyCycles(graph).length) return null
  const claims = claimNodes(graph).map((node) => node.id).sort()
  const incomingCount = new Map(claims.map((id) => [id, 0]))
  const adj = new Map<string, string[]>()
  for (const id of claims) adj.set(id, [])
  for (const edge of graph.edges.filter((item) => item.kind === "DEPENDS_ON")) {
    if (!incomingCount.has(edge.fromNodeId) || !incomingCount.has(edge.toNodeId)) continue
    adj.get(edge.toNodeId)!.push(edge.fromNodeId)
    incomingCount.set(edge.fromNodeId, (incomingCount.get(edge.fromNodeId) ?? 0) + 1)
  }
  const ready = claims.filter((id) => incomingCount.get(id) === 0).sort()
  const order: string[] = []
  while (ready.length) {
    const id = ready.shift()!
    order.push(id)
    for (const next of (adj.get(id) ?? []).sort()) {
      incomingCount.set(next, (incomingCount.get(next) ?? 1) - 1)
      if (incomingCount.get(next) === 0) ready.push(next)
      ready.sort()
    }
  }
  return order.length === claims.length ? order : null
}

export function staleImpact(graph: ResearchGraph, claimId: string): string[] {
  const seen = new Set<string>()
  const walk = (id: string) => {
    for (const dep of dependentsOf(graph, id)) {
      if (seen.has(dep)) continue
      seen.add(dep)
      walk(dep)
    }
  }
  walk(claimId)
  return [...seen].sort()
}

export function blockingChain(graph: ResearchGraph, blockerId: string): string[] {
  const blocker = graph.nodes.find((node) => node.id === blockerId)
  const target = graph.edges.find((edge) => edge.kind === "BLOCKS" && edge.fromNodeId === blockerId)?.toNodeId
  if (!target) return blocker ? [blockerId] : []
  return [blockerId, target, ...staleImpact(graph, target)]
}

export function unverifiedFrontier(graph: ResearchGraph, objectiveId?: string | null): string[] {
  const focus = objectiveId ?? graph.metadata.focusNodeId
  const relevant = new Set<string>()
  if (focus) {
    relevant.add(focus)
    const stack = [focus]
    while (stack.length) {
      const id = stack.pop()!
      for (const dep of dependenciesOf(graph, id)) {
        if (relevant.has(dep)) continue
        relevant.add(dep)
        stack.push(dep)
      }
    }
  } else {
    for (const node of claimNodes(graph)) relevant.add(node.id)
  }
  const frontier: string[] = []
  for (const id of relevant) {
    const node = graph.nodes.find((item) => item.id === id)
    if (!node || VERIFIED.has(node.epistemicStatus ?? "")) continue
    const prereqs = dependenciesOf(graph, id)
    if (prereqs.every((dep) => VERIFIED.has(graph.nodes.find((item) => item.id === dep)?.epistemicStatus ?? ""))) frontier.push(id)
  }
  return frontier.sort()
}

export function orphanClaims(graph: ResearchGraph): string[] {
  const objective = graph.metadata.focusNodeId
  if (!objective) return []
  const connected = new Set<string>([objective])
  const stack = [objective]
  while (stack.length) {
    const id = stack.pop()!
    for (const next of [...dependenciesOf(graph, id), ...dependentsOf(graph, id)]) {
      if (connected.has(next)) continue
      connected.add(next)
      stack.push(next)
    }
  }
  return claimNodes(graph).map((node) => node.id).filter((id) => !connected.has(id)).sort()
}

export function openBlockersOnObjectivePath(graph: ResearchGraph): string[] {
  const objective = graph.metadata.focusNodeId
  if (!objective) return []
  const onPath = new Set<string>([objective, ...staleImpact(graph, objective)])
  const stack = [objective]
  while (stack.length) {
    const id = stack.pop()!
    for (const dep of dependenciesOf(graph, id)) {
      if (onPath.has(dep)) continue
      onPath.add(dep)
      stack.push(dep)
    }
  }
  return graph.edges
    .filter((edge) => edge.kind === "BLOCKS" && onPath.has(edge.toNodeId))
    .map((edge) => edge.fromNodeId)
    .sort()
}

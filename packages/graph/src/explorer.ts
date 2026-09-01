import type { ResearchGraph, ResearchGraphNode } from "./types.ts"
import { neighborhood } from "./query.ts"

export type GraphFilter = "all" | "proof" | "blockers" | "verified" | "branch-local"

export interface GraphExplorerState {
  focusId: string | null
  selectedId: string | null
  depth: number
  filter: GraphFilter
  query: string
}

export function initialExplorer(graph: ResearchGraph): GraphExplorerState {
  return { focusId: graph.metadata.focusNodeId, selectedId: graph.metadata.focusNodeId, depth: 2, filter: "all", query: "" }
}

export function visibleExplorerNodes(graph: ResearchGraph, state: GraphExplorerState): ResearchGraphNode[] {
  const focus = state.focusId ?? graph.metadata.focusNodeId
  const slice = focus ? neighborhood(graph, focus, state.depth).nodes : graph.nodes
  return slice.filter((node) => {
    if (state.query && !`${node.id} ${node.label}`.toLowerCase().includes(state.query.toLowerCase())) return false
    if (state.filter === "proof") return ["OBJECTIVE", "CLAIM", "FORMAL_STATEMENT", "PROOF_ATTEMPT", "VERIFICATION", "BLOCKER"].includes(node.kind)
    if (state.filter === "blockers") return node.kind === "BLOCKER" || node.epistemicStatus === "BLOCKED"
    if (state.filter === "verified") return node.epistemicStatus === "KERNEL_VERIFIED" || node.epistemicStatus === "INDEPENDENTLY_CHECKED"
    if (state.filter === "branch-local") return node.origin === "LOCAL"
    return true
  })
}

export function moveSelection(nodes: ResearchGraphNode[], selectedId: string | null, delta: number): string | null {
  if (!nodes.length) return selectedId
  const index = Math.max(0, nodes.findIndex((node) => node.id === selectedId))
  const next = Math.min(nodes.length - 1, Math.max(0, index + delta))
  return nodes[next]?.id ?? selectedId
}

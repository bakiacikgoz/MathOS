import type { ResearchGraph, ResearchGraphNode } from "./types.ts"
import { dependenciesOf, neighborhood } from "./query.ts"

function glyph(node: ResearchGraphNode): string {
  if (node.epistemicStatus === "KERNEL_VERIFIED" || node.epistemicStatus === "INDEPENDENTLY_CHECKED") return "✓"
  if (node.kind === "BLOCKER" || node.epistemicStatus === "BLOCKED") return "!"
  if (node.kind === "PROOF_ATTEMPT" && node.summary && node.summary !== "KERNEL_ACCEPTED") return "×"
  if (node.origin === "INHERITED") return "○"
  return "●"
}

export function formatGraphTree(graph: ResearchGraph, focusId?: string | null, depth = 2): string {
  const focus = focusId ?? graph.metadata.focusNodeId
  if (!focus) return "PROOF GRAPH\n(no objective)"
  const slice = neighborhood(graph, focus, depth)
  const local = { ...graph, nodes: slice.nodes, edges: slice.edges }
  const lines: string[] = [`PROOF GRAPH · ${focus}`]
  const root = local.nodes.find((node) => node.id === focus)
  if (!root) return `${lines[0]}\n(missing focus)`
  lines.push(`${root.id}  ${glyph(root)} ${root.epistemicStatus ?? root.kind}`)
  const walk = (id: string, prefix: string, seen: Set<string>) => {
    const deps = dependenciesOf(local, id)
    deps.forEach((depId, index) => {
      if (seen.has(depId)) return
      seen.add(depId)
      const node = local.nodes.find((item) => item.id === depId)
      const last = index === deps.length - 1
      const branch = last ? "└── " : "├── "
      const nextPrefix = prefix + (last ? "    " : "│   ")
      lines.push(`${prefix}${branch}${depId}  ${glyph(node ?? { id: depId, kind: "CLAIM", workspaceId: "", entityId: depId, label: depId })} ${node?.epistemicStatus ?? node?.kind ?? ""}`.trimEnd())
      const attempts = local.edges.filter((edge) => edge.kind === "PROOF_ATTEMPT_FOR" && edge.toNodeId === depId)
      const blockers = local.edges.filter((edge) => edge.kind === "BLOCKS" && edge.toNodeId === depId)
      const extras = [...attempts, ...blockers]
      extras.forEach((edge, extraIndex) => {
        const child = local.nodes.find((item) => item.id === edge.fromNodeId)
        const extraLast = extraIndex === extras.length - 1 && dependenciesOf(local, depId).length === 0
        lines.push(`${nextPrefix}${extraLast ? "└── " : "└── "}${child?.id ?? edge.fromNodeId}  ${glyph(child ?? { id: "", kind: "BLOCKER", workspaceId: "", entityId: "", label: "" })} ${child?.summary ?? child?.kind ?? ""}`)
      })
      walk(depId, nextPrefix, seen)
    })
  }
  walk(focus, "", new Set([focus]))
  return lines.join("\n")
}

export function formatGraphJson(graph: ResearchGraph, analysis: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    schemaVersion: "research-graph-v1",
    workspaceId: graph.metadata.workspaceId,
    branchId: graph.metadata.branchId,
    focusNodeId: graph.metadata.focusNodeId,
    graphHash: graph.metadata.graphHash,
    nodes: graph.nodes,
    edges: graph.edges,
    analysis,
  }, null, 2)}\n`
}

export function formatGraphDot(graph: ResearchGraph): string {
  const lines = ["digraph ResearchGraph {"]
  for (const node of graph.nodes) {
    lines.push(`  "${node.id}" [label="${node.id}\\n${node.epistemicStatus ?? node.kind}"];`)
  }
  for (const edge of graph.edges) {
    lines.push(`  "${edge.fromNodeId}" -> "${edge.toNodeId}" [label="${edge.kind}"];`)
  }
  lines.push("}")
  return lines.join("\n")
}

export function formatGraphMermaid(graph: ResearchGraph): string {
  const lines = ["graph TD"]
  for (const edge of graph.edges) lines.push(`  ${edge.fromNodeId} -->|${edge.kind}| ${edge.toNodeId}`)
  return lines.join("\n")
}

export function formatClaimDetail(graph: ResearchGraph, claimId: string): string {
  const node = graph.nodes.find((item) => item.id === claimId)
  if (!node) return `CLAIM ${claimId}\n(not visible)`
  const deps = graph.edges.filter((edge) => edge.kind === "DEPENDS_ON" && edge.fromNodeId === claimId)
  const dependents = graph.edges.filter((edge) => edge.kind === "DEPENDS_ON" && edge.toNodeId === claimId)
  const attempts = graph.edges.filter((edge) => edge.kind === "PROOF_ATTEMPT_FOR" && edge.toNodeId === claimId)
  const blockers = graph.edges.filter((edge) => edge.kind === "BLOCKS" && edge.toNodeId === claimId)
  const last = attempts.map((edge) => graph.nodes.find((item) => item.id === edge.fromNodeId)?.summary).filter(Boolean).at(-1)
  return [
    `CLAIM ${claimId}`,
    `Status ${node.epistemicStatus ?? "n/a"}`,
    `Fidelity ${node.formalizationFidelity ?? "n/a"}`,
    `Branch ${node.branchId ?? "n/a"}`,
    `Origin ${node.origin ?? "n/a"}`,
    `Dependencies ${deps.length}`,
    `Dependents ${dependents.length}`,
    `Proof attempts ${attempts.length}`,
    `Last failure ${last ?? "n/a"}`,
    `Open blockers ${blockers.map((edge) => edge.fromNodeId).join(" ") || "none"}`,
  ].join("\n")
}

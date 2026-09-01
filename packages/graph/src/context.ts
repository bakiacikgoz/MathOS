import { createHash } from "node:crypto"
import type { ClaimStatus, FidelityStatus } from "@mathos/domain"
import type { GraphOrigin, ResearchGraph, ResearchGraphNode } from "./types.ts"
import { blockersOf, dependenciesOf, dependentsOf, proofAttemptsOf } from "./query.ts"
import { blockingChain, staleImpact, unverifiedFrontier } from "./analysis.ts"

export interface GraphContextBudget {
  maxClaims: number
  maxBlockers: number
  maxFailures: number
  maxDepth: number
  maxComputationalEvidence: number
  maxLiteratureResults: number
}

export const DEFAULT_GRAPH_CONTEXT_BUDGET: GraphContextBudget = {
  maxClaims: 12,
  maxBlockers: 6,
  maxFailures: 4,
  maxDepth: 2,
  maxComputationalEvidence: 4,
  maxLiteratureResults: 4,
}

export interface GraphClaimSummary {
  id: string
  title: string
  status: ClaimStatus | string
  fidelity?: string
  origin?: GraphOrigin
  distance?: number
}

export interface GraphBlockerSummary {
  id: string
  type: string
  claimId: string | null
  chain: string[]
  downstreamCount: number
}

export interface GraphProofFailureSummary {
  attemptId: string
  claimId: string
  failureClass: string
}

export interface GraphImportSummary {
  targetClaimId: string
  sourceClaimId: string
  sourceBranchId?: string
  targetStatus: string
}

export interface GraphBranchSummary {
  branchId: string
}

export interface GraphContextSummary {
  objectiveClaimId: string | null
  focusClaimId: string | null
  directDependencies: GraphClaimSummary[]
  directDependents: GraphClaimSummary[]
  unverifiedFrontier: GraphClaimSummary[]
  openBlockingChain: GraphBlockerSummary[]
  verifiedPrerequisites: GraphClaimSummary[]
  recentFailedProofRoutes: GraphProofFailureSummary[]
  staleImpact: GraphClaimSummary[]
  branchOrigin?: GraphBranchSummary
  importedDependencies: GraphImportSummary[]
  computationalEvidence: Array<{ experimentId: string; resultId: string; outcome: string; summary: string }>
  literatureContext: Array<{ externalResultId: string; sourceId: string; name: string; locator: string; status: string }>
  fidelity?: { claimId: string; status: string; blocked: boolean }
  notes: string[]
  graphRevision: string
  graphContextHash: string
}

export interface TeamGraphContextSummary {
  objectiveClaimId: string | null
  workers: Array<{ agentId: string; branchId: string; focusClaimId: string | null; openBlockers: string[]; verifiedLocal: string[] }>
  frontier: GraphClaimSummary[]
  solutionCandidates: string[]
  imports: GraphImportSummary[]
  graphRevision: string
}

function claimNode(graph: ResearchGraph, id: string): ResearchGraphNode | undefined {
  return graph.nodes.find((node) => node.id === id && (node.kind === "CLAIM" || node.kind === "OBJECTIVE"))
}

function toClaim(graph: ResearchGraph, id: string, distance?: number): GraphClaimSummary | null {
  const node = claimNode(graph, id)
  if (!node) return null
  return {
    id: node.id,
    title: node.label,
    status: node.epistemicStatus ?? "CONJECTURE",
    fidelity: node.formalizationFidelity ? String(node.formalizationFidelity) : undefined,
    origin: node.origin,
    distance,
  }
}

function distanceMap(graph: ResearchGraph, origin: string, maxDepth: number): Map<string, number> {
  const dist = new Map<string, number>([[origin, 0]])
  const queue = [origin]
  while (queue.length) {
    const id = queue.shift()!
    const d = dist.get(id) ?? 0
    if (d >= maxDepth) continue
    for (const next of [...dependenciesOf(graph, id), ...dependentsOf(graph, id)]) {
      if (dist.has(next)) continue
      dist.set(next, d + 1)
      queue.push(next)
    }
  }
  return dist
}

function take<T>(items: T[], n: number): T[] {
  return items.slice(0, n)
}

export function hashGraphContext(summary: Omit<GraphContextSummary, "graphContextHash">): string {
  const payload = {
    objectiveClaimId: summary.objectiveClaimId,
    focusClaimId: summary.focusClaimId,
    directDependencies: summary.directDependencies.map((item) => item.id),
    unverifiedFrontier: summary.unverifiedFrontier.map((item) => item.id),
    openBlockingChain: summary.openBlockingChain.map((item) => item.id),
    verifiedPrerequisites: summary.verifiedPrerequisites.map((item) => item.id),
    recentFailedProofRoutes: summary.recentFailedProofRoutes.map((item) => item.attemptId),
    importedDependencies: summary.importedDependencies.map((item) => item.targetClaimId),
    computationalEvidence: summary.computationalEvidence.map((item) => item.resultId),
    literatureContext: summary.literatureContext.map((item) => item.externalResultId),
    graphRevision: summary.graphRevision,
  }
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex")
}

export function buildGraphContextSummary(
  graph: ResearchGraph,
  input: { focusClaimId?: string | null; budget?: Partial<GraphContextBudget>; digestClaimIds?: string[] } = {},
): GraphContextSummary {
  const budget = { ...DEFAULT_GRAPH_CONTEXT_BUDGET, ...input.budget }
  const objectiveId = graph.metadata.focusNodeId
  const focusId = input.focusClaimId ?? objectiveId
  const dist = focusId ? distanceMap(graph, focusId, budget.maxDepth) : new Map<string, number>()
  const rank = (id: string) => dist.get(id) ?? 99
  const notes = [
    "Verified prerequisites do not imply the objective is verified.",
    "Dependency path is research structure, not mathematical proof.",
    "Frontier items are structural candidates, not mandatory next steps.",
  ]
  const deps = focusId ? dependenciesOf(graph, focusId).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)) : []
  const dens = focusId ? dependentsOf(graph, focusId).sort((a, b) => a.localeCompare(b)) : []
  const frontierIds = unverifiedFrontier(graph, objectiveId).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  const blockerNodes = graph.nodes.filter((node) => node.kind === "BLOCKER").sort((a, b) => a.id.localeCompare(b.id))
  const chains = blockerNodes.map((node) => {
    const chain = blockingChain(graph, node.id)
    const claimId = chain[1] ?? null
    return {
      id: node.id,
      type: node.summary ?? node.label,
      claimId,
      chain,
      downstreamCount: Math.max(0, chain.length - 2),
    } satisfies GraphBlockerSummary
  })
  const failures: GraphProofFailureSummary[] = []
  for (const node of graph.nodes.filter((item) => item.kind === "PROOF_ATTEMPT")) {
    const target = graph.edges.find((edge) => edge.kind === "PROOF_ATTEMPT_FOR" && edge.fromNodeId === node.id)?.toNodeId
    if (!target) continue
    if (!node.summary || node.summary === "KERNEL_ACCEPTED") continue
    failures.push({ attemptId: node.id, claimId: target, failureClass: node.summary })
  }
  failures.sort((a, b) => a.attemptId.localeCompare(b.attemptId))
  const verified = deps.map((id) => toClaim(graph, id, rank(id))).filter((item): item is GraphClaimSummary => Boolean(item && (item.status === "KERNEL_VERIFIED" || item.status === "INDEPENDENTLY_CHECKED")))
  const staleIds = focusId ? [focusId, ...deps].filter((id) => claimNode(graph, id)?.epistemicStatus === "STALE") : []
  const stale = staleIds.flatMap((id) => staleImpact(graph, id)).sort()
  if (stale.length) notes.push("STALE DEPENDENCY WARNING")
  const imported: GraphImportSummary[] = []
  for (const edge of graph.edges.filter((item) => item.kind === "IMPORTS_FROM")) {
    const target = claimNode(graph, edge.fromNodeId)
    if (!target) continue
    imported.push({
      targetClaimId: edge.fromNodeId,
      sourceClaimId: edge.toNodeId,
      sourceBranchId: graph.nodes.find((node) => node.id === edge.toNodeId)?.branchId,
      targetStatus: String(target.epistemicStatus ?? ""),
    })
  }
  const digest = new Set(input.digestClaimIds ?? [])
  const allowedImports = imported.filter((item) => item.targetStatus === "KERNEL_VERIFIED" || digest.has(item.targetClaimId))
  const focus = focusId ? claimNode(graph, focusId) : undefined
  const fidelityStatus = focus?.formalizationFidelity ? String(focus.formalizationFidelity) : undefined
  const blocked = fidelityStatus === "REJECTED" || fidelityStatus === "MISMATCH" || fidelityStatus === "POTENTIAL_MISMATCH"
  if (blocked) notes.push("proof execution blocked / human fidelity review required")
  const computationalEvidence = graph.edges
    .filter((edge) => (edge.kind === "SUPPORTS" || edge.kind === "COUNTEREXAMPLE_TO") && (focusId ? edge.toNodeId === focusId : true))
    .map((edge) => {
      const result = graph.nodes.find((node) => node.id === edge.fromNodeId && node.kind === "EXPERIMENT_RESULT")
      const experiment = graph.edges.find((item) => item.kind === "PRODUCES" && item.toNodeId === edge.fromNodeId)?.fromNodeId
      return result && experiment ? { experimentId: experiment, resultId: result.id, outcome: result.summary ?? "", summary: result.label } : null
    })
    .filter((item): item is { experimentId: string; resultId: string; outcome: string; summary: string } => Boolean(item))
  if (computationalEvidence.length) notes.push("COMPUTATIONAL EVIDENCE — NOT PROOF")
  const literatureContext = graph.nodes.filter((node) => node.kind === "EXTERNAL_RESULT").map((node) => {
    const sourceId = graph.edges.find((edge) => edge.kind === "EXTRACTED_FROM" && edge.fromNodeId === node.id)?.toNodeId ?? ""
    return { externalResultId: node.id, sourceId, name: node.label, locator: node.summary ?? "", status: node.summary ?? "" }
  })
  if (literatureContext.length) notes.push("EXTERNAL SOURCE — NOT KERNEL VERIFIED")
  const draft: Omit<GraphContextSummary, "graphContextHash"> = {
    objectiveClaimId: objectiveId,
    focusClaimId: focusId,
    directDependencies: take(deps.map((id) => toClaim(graph, id, rank(id))).filter((item): item is GraphClaimSummary => Boolean(item)), budget.maxClaims),
    directDependents: take(dens.map((id) => toClaim(graph, id)).filter((item): item is GraphClaimSummary => Boolean(item)), budget.maxClaims),
    unverifiedFrontier: take(frontierIds.map((id) => toClaim(graph, id, rank(id))).filter((item): item is GraphClaimSummary => Boolean(item)), budget.maxClaims),
    openBlockingChain: take(chains, budget.maxBlockers),
    verifiedPrerequisites: take(verified, budget.maxClaims),
    recentFailedProofRoutes: take(failures, budget.maxFailures),
    staleImpact: take(stale.map((id) => toClaim(graph, id)).filter((item): item is GraphClaimSummary => Boolean(item)), budget.maxClaims),
    branchOrigin: graph.metadata.branchId ? { branchId: graph.metadata.branchId } : undefined,
    importedDependencies: allowedImports,
    computationalEvidence: take(computationalEvidence, budget.maxComputationalEvidence),
    literatureContext: take(literatureContext, budget.maxLiteratureResults),
    fidelity: focusId && fidelityStatus ? { claimId: focusId, status: fidelityStatus, blocked } : undefined,
    notes,
    graphRevision: graph.metadata.graphHash,
  }
  return { ...draft, graphContextHash: hashGraphContext(draft) }
}

export function formatGraphContext(summary: GraphContextSummary): string {
  const line = (title: string, rows: string[]) => [title, ...rows.map((row) => `  ${row}`)].join("\n")
  return [
    `OBJECTIVE ${summary.objectiveClaimId ?? "none"}`,
    `FOCUS ${summary.focusClaimId ?? "none"}`,
    line("DEPENDENCIES", summary.directDependencies.map((item) => `${item.id} ${item.status}`)),
    line("UNVERIFIED FRONTIER", summary.unverifiedFrontier.map((item) => `${item.id} ${item.status}`)),
    line("OPEN BLOCKERS", summary.openBlockingChain.map((item) => `${item.id} ${item.chain.join(" → ")} affects ${item.downstreamCount} downstream claims`)),
    line("VERIFIED SUPPORT", summary.verifiedPrerequisites.map((item) => `${item.id} ${item.status}`)),
    line("FAILED ROUTES", summary.recentFailedProofRoutes.map((item) => `${item.claimId} ${item.failureClass}`)),
    line("IMPORTED SUPPORT", summary.importedDependencies.map((item) => `${item.targetClaimId} from ${item.sourceClaimId} ${item.targetStatus}`)),
    line("COMPUTATIONAL EVIDENCE — NOT PROOF", summary.computationalEvidence.map((item) => `${item.experimentId} ${item.outcome}`)),
    line("EXTERNAL SOURCE — NOT KERNEL VERIFIED", summary.literatureContext.map((item) => `${item.externalResultId} ${item.name} ${item.sourceId}`)),
    summary.fidelity ? `FIDELITY ${summary.fidelity.claimId} ${summary.fidelity.status}${summary.fidelity.blocked ? " BLOCKED" : ""}` : "FIDELITY n/a",
    ...summary.notes,
  ].join("\n")
}

export function formatPlannerGraphPrompt(summary: GraphContextSummary): string {
  return [
    "GRAPH CONTEXT (read-only research structure)",
    formatGraphContext(summary),
    "Do not set claim or verification status. Do not spawn agents, create branches, merge, or apply imports.",
    "A successful computation is evidence, not a formal proof. Never mark a claim KERNEL_VERIFIED from an experiment.",
    "No counterexample found in a finite domain does not mean the theorem is true.",
    "A paper or book statement is not KERNEL_VERIFIED. External source ≠ proof.",
  ].join("\n")
}

export function summarizeObjective(graph: ResearchGraph, claimId: string): string {
  const node = claimNode(graph, claimId)
  const summary = buildGraphContextSummary(graph, { focusClaimId: claimId })
  const prereqs = dependenciesOf(graph, claimId)
  const verified = prereqs.filter((id) => {
    const status = claimNode(graph, id)?.epistemicStatus
    return status === "KERNEL_VERIFIED" || status === "INDEPENDENTLY_CHECKED"
  })
  return [
    `OBJECTIVE ${claimId}`,
    `Status ${node?.epistemicStatus ?? "n/a"}`,
    `Known prerequisites ${prereqs.length}`,
    `Kernel verified ${verified.length}`,
    `Unverified frontier ${summary.unverifiedFrontier.map((item) => item.id).join(" ") || "none"}`,
    `Open blocking chains ${summary.openBlockingChain.length}`,
    `Failed proof attempts ${summary.recentFailedProofRoutes.length}`,
    `Formalization fidelity ${node?.formalizationFidelity ?? "n/a"}`,
  ].join("\n")
}

export function unresolvedDependencies(graph: ResearchGraph, claimId: string): GraphClaimSummary[] {
  return dependenciesOf(graph, claimId)
    .map((id) => toClaim(graph, id))
    .filter((item): item is GraphClaimSummary => Boolean(item && item.status !== "KERNEL_VERIFIED" && item.status !== "INDEPENDENTLY_CHECKED"))
}

export function verifiedSupport(graph: ResearchGraph, claimId: string): GraphClaimSummary[] {
  return buildGraphContextSummary(graph, { focusClaimId: claimId }).verifiedPrerequisites
}

export function nextOpenFrontier(graph: ResearchGraph, claimId: string): GraphClaimSummary[] {
  return buildGraphContextSummary(graph, { focusClaimId: claimId }).unverifiedFrontier
}

export function blockingChains(graph: ResearchGraph, claimId: string): GraphBlockerSummary[] {
  return buildGraphContextSummary(graph, { focusClaimId: claimId }).openBlockingChain.filter((item) => item.chain.includes(claimId))
}

export function formatFrontier(summary: GraphContextSummary): string {
  const lines = [`UNVERIFIED FRONTIER · ${summary.objectiveClaimId ?? "none"}`]
  for (const item of summary.unverifiedFrontier) {
    const blocker = summary.openBlockingChain.find((row) => row.claimId === item.id)
    lines.push(`${item.id}  ${item.status}`)
    if (blocker) lines.push(`  blocker ${blocker.id}`)
  }
  return lines.join("\n")
}

export function buildTeamGraphContext(input: {
  graph: ResearchGraph
  workers: Array<{ agentId: string; branchId: string; focusClaimId: string | null; localClaimId: string }>
  solutions: string[]
}): TeamGraphContextSummary {
  const summary = buildGraphContextSummary(input.graph)
  return {
    objectiveClaimId: summary.objectiveClaimId,
    workers: input.workers.map((worker) => ({
      agentId: worker.agentId,
      branchId: worker.branchId,
      focusClaimId: worker.focusClaimId,
      openBlockers: blockersOf(input.graph, worker.localClaimId).map((node) => node.id),
      verifiedLocal: input.graph.nodes.filter((node) => node.origin === "LOCAL" && node.branchId === worker.branchId && (node.epistemicStatus === "KERNEL_VERIFIED" || node.epistemicStatus === "INDEPENDENTLY_CHECKED")).map((node) => node.id),
    })),
    frontier: summary.unverifiedFrontier,
    solutionCandidates: input.solutions,
    imports: summary.importedDependencies,
    graphRevision: summary.graphRevision,
  }
}

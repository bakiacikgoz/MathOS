import { classifyLeanFailure, type DependencyRelation } from "@mathos/domain"
import { semanticGraphHash } from "./hash.ts"
import type {
  GraphOrigin,
  ResearchGraph,
  ResearchGraphBuildOptions,
  ResearchGraphEdge,
  ResearchGraphEdgeKind,
  ResearchGraphNode,
  ResearchGraphSnapshot,
} from "./types.ts"
import { PROOF_NODE_KINDS } from "./types.ts"

const RELATION_EDGE: Partial<Record<DependencyRelation, ResearchGraphEdgeKind>> = {
  depends_on: "DEPENDS_ON",
  supported_by: "SUPPORTS",
  derived_from: "DERIVED_FROM",
  blocks: "BLOCKS",
  resolves: "RESOLVES",
  formalizes: "FORMALIZES",
  verified_by: "VERIFIES",
}

function edgeId(kind: string, from: string, to: string): string {
  return `E:${kind}:${from}:${to}`
}

export function buildResearchGraph(snapshot: ResearchGraphSnapshot, options: ResearchGraphBuildOptions = {}): ResearchGraph {
  const includeInherited = options.includeInherited !== false
  const includeRuntime = options.includeResearchRuntime === true
  const includeFailed = options.includeFailedProofAttempts !== false
  const includeImports = options.includeImports !== false
  const branchId = options.branchId ?? null
  const visible = new Map<string, GraphOrigin>()
  if (branchId) {
    for (const row of snapshot.visibility.filter((item) => item.branchId === branchId)) {
      const origin = (["LOCAL", "INHERITED", "IMPORTED", "MERGED"].includes(row.relation) ? row.relation : "LOCAL") as GraphOrigin
      if (!includeInherited && origin === "INHERITED") continue
      visible.set(row.claimId, origin)
    }
  } else if (snapshot.visibility.length) {
    for (const row of snapshot.visibility) {
      const origin = (["LOCAL", "INHERITED", "IMPORTED", "MERGED"].includes(row.relation) ? row.relation : "LOCAL") as GraphOrigin
      visible.set(row.claimId, origin)
    }
  } else {
    for (const claim of snapshot.claims) visible.set(claim.id, "LOCAL")
  }
  const claimById = new Map(snapshot.claims.map((claim) => [claim.id, claim]))
  const nodes: ResearchGraphNode[] = []
  const edges: ResearchGraphEdge[] = []
  const nodeIds = new Set<string>()

  const addNode = (node: ResearchGraphNode) => {
    if (nodeIds.has(node.id)) return
    nodeIds.add(node.id)
    nodes.push(node)
  }
  const addEdge = (edge: ResearchGraphEdge) => {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) return
    edges.push(edge)
  }

  for (const branch of snapshot.branches) {
    if (!includeRuntime && options.proofOnly) continue
    if (includeRuntime || !options.proofOnly) {
      addNode({
        id: branch.id,
        kind: "BRANCH",
        workspaceId: snapshot.workspaceId,
        branchId: branch.id,
        entityId: branch.id,
        label: branch.name,
      })
    }
  }

  for (const claim of snapshot.claims) {
    const origin = visible.get(claim.id)
    if (!origin) continue
    const isObjective = snapshot.mainObjectiveId === claim.id
    addNode({
      id: claim.id,
      kind: isObjective ? "OBJECTIVE" : "CLAIM",
      workspaceId: snapshot.workspaceId,
      branchId: claim.branchId,
      entityId: claim.id,
      label: claim.title,
      epistemicStatus: claim.status,
      createdAt: claim.createdAt,
      origin,
      provenance: { branchId: claim.branchId, origin },
    })
    if (includeRuntime && nodeIds.has(claim.branchId)) {
      addEdge({
        id: edgeId("ON_BRANCH", claim.id, claim.branchId),
        kind: "ON_BRANCH",
        fromNodeId: claim.id,
        toNodeId: claim.branchId,
        workspaceId: snapshot.workspaceId,
        branchId: claim.branchId,
      })
    }
  }

  for (const dep of snapshot.dependencies) {
    if (!visible.has(dep.fromClaimId) || !visible.has(dep.toClaimId)) continue
    const kind = RELATION_EDGE[dep.relation]
    if (!kind) continue
    addEdge({
      id: edgeId(kind, dep.fromClaimId, dep.toClaimId),
      kind,
      fromNodeId: dep.fromClaimId,
      toNodeId: dep.toClaimId,
      workspaceId: snapshot.workspaceId,
    })
  }

  for (const formal of snapshot.formals) {
    if (!visible.has(formal.claimId) || !formal.isCurrent) continue
    addNode({
      id: formal.id,
      kind: "FORMAL_STATEMENT",
      workspaceId: snapshot.workspaceId,
      entityId: formal.id,
      label: formal.declarationName,
      formalizationFidelity: formal.fidelityStatus,
      createdAt: formal.createdAt,
    })
    addEdge({
      id: edgeId("FORMALIZES", formal.id, formal.claimId),
      kind: "FORMALIZES",
      fromNodeId: formal.id,
      toNodeId: formal.claimId,
      workspaceId: snapshot.workspaceId,
    })
    const claim = nodes.find((node) => node.id === formal.claimId)
    if (claim) claim.formalizationFidelity = formal.fidelityStatus
  }

  for (const attempt of snapshot.proofs) {
    if (!visible.has(attempt.claimId)) continue
    if (!includeFailed && attempt.status === "FAILED") continue
    const failure = attempt.status === "FAILED" ? classifyLeanFailure(attempt.diagnostics.map((item) => item.message)) : null
    addNode({
      id: attempt.id,
      kind: "PROOF_ATTEMPT",
      workspaceId: snapshot.workspaceId,
      entityId: attempt.id,
      label: `${attempt.id} ${attempt.status}${failure ? ` ${failure}` : ""}`,
      summary: failure ?? attempt.status,
      createdAt: attempt.createdAt,
    })
    addEdge({
      id: edgeId("PROOF_ATTEMPT_FOR", attempt.id, attempt.claimId),
      kind: "PROOF_ATTEMPT_FOR",
      fromNodeId: attempt.id,
      toNodeId: attempt.claimId,
      workspaceId: snapshot.workspaceId,
    })
  }

  for (const run of snapshot.verifications) {
    const claimId = run.claimId
    if (!claimId || !visible.has(claimId)) continue
    addNode({
      id: run.id,
      kind: "VERIFICATION",
      workspaceId: snapshot.workspaceId,
      entityId: run.id,
      label: `${run.id} ${run.result}`,
      summary: run.result,
      createdAt: run.createdAt,
    })
    addEdge({
      id: edgeId("VERIFIES", run.id, claimId),
      kind: "VERIFIES",
      fromNodeId: run.id,
      toNodeId: claimId,
      workspaceId: snapshot.workspaceId,
    })
  }

  for (const blocker of snapshot.blockers) {
    if (blocker.claimId && !visible.has(blocker.claimId)) continue
    addNode({
      id: blocker.id,
      kind: "BLOCKER",
      workspaceId: snapshot.workspaceId,
      branchId: blocker.branchId,
      entityId: blocker.id,
      label: `${blocker.id} ${blocker.type}`,
      summary: blocker.summary,
      createdAt: blocker.createdAt,
    })
    if (blocker.claimId) {
      addEdge({
        id: edgeId(blocker.status === "RESOLVED" ? "RESOLVES" : "BLOCKS", blocker.id, blocker.claimId),
        kind: blocker.status === "RESOLVED" ? "RESOLVES" : "BLOCKS",
        fromNodeId: blocker.id,
        toNodeId: blocker.claimId,
        workspaceId: snapshot.workspaceId,
        branchId: blocker.branchId,
      })
    }
  }

  if (includeRuntime) {
    for (const decision of snapshot.decisions) {
      addNode({
        id: decision.id,
        kind: "DECISION",
        workspaceId: snapshot.workspaceId,
        branchId: decision.branchId,
        entityId: decision.id,
        label: decision.summary,
        createdAt: decision.createdAt,
      })
    }
    for (const run of snapshot.runs) {
      addNode({
        id: run.id,
        kind: "RESEARCH_RUN",
        workspaceId: snapshot.workspaceId,
        branchId: run.branchId,
        entityId: run.id,
        label: run.id,
        createdAt: run.createdAt,
        provenance: { runId: run.id, agentId: run.agentId ?? undefined, branchId: run.branchId },
      })
      if (run.objectiveClaimId && nodeIds.has(run.objectiveClaimId)) {
        addEdge({
          id: edgeId("CREATED_BY_RUN", run.objectiveClaimId, run.id),
          kind: "CREATED_BY_RUN",
          fromNodeId: run.objectiveClaimId,
          toNodeId: run.id,
          workspaceId: snapshot.workspaceId,
        })
      }
    }
    for (const agent of snapshot.agents) {
      addNode({
        id: agent.id,
        kind: "AGENT",
        workspaceId: snapshot.workspaceId,
        branchId: agent.branchId,
        entityId: agent.id,
        label: `${agent.id} ${agent.role}`,
        provenance: { agentId: agent.id, branchId: agent.branchId, runId: agent.researchRunId },
      })
      if (nodeIds.has(agent.localClaimId)) {
        addEdge({
          id: edgeId("CREATED_BY_AGENT", agent.localClaimId, agent.id),
          kind: "CREATED_BY_AGENT",
          fromNodeId: agent.localClaimId,
          toNodeId: agent.id,
          workspaceId: snapshot.workspaceId,
        })
      }
    }
  }

  if (includeImports) {
    for (const item of snapshot.imports) {
      addNode({
        id: item.id,
        kind: "IMPORT",
        workspaceId: snapshot.workspaceId,
        entityId: item.id,
        label: `${item.id} ${item.status}`,
        summary: item.status,
      })
      if (item.targetClaimId && visible.has(item.targetClaimId) && visible.has(item.sourceClaimId)) {
        addEdge({
          id: edgeId("IMPORTS_FROM", item.targetClaimId, item.sourceClaimId),
          kind: "IMPORTS_FROM",
          fromNodeId: item.targetClaimId,
          toNodeId: item.sourceClaimId,
          workspaceId: snapshot.workspaceId,
        })
        addEdge({
          id: edgeId("DERIVED_FROM", item.targetClaimId, item.sourceClaimId),
          kind: "DERIVED_FROM",
          fromNodeId: item.targetClaimId,
          toNodeId: item.sourceClaimId,
          workspaceId: snapshot.workspaceId,
        })
      }
    }
  }

  if (!options.proofOnly && options.includeComputation !== false) {
    const results = snapshot.experimentResults ?? []
    for (const experiment of snapshot.experiments ?? []) {
      if (branchId && experiment.branchId !== branchId) continue
      addNode({
        id: experiment.id,
        kind: "EXPERIMENT",
        workspaceId: snapshot.workspaceId,
        branchId: experiment.branchId,
        entityId: experiment.id,
        label: `${experiment.id} ${experiment.kind}`,
        summary: experiment.status,
        origin: "LOCAL",
      })
      if (experiment.claimId && nodeIds.has(experiment.claimId)) {
        addEdge({
          id: edgeId("EXPERIMENT_FOR", experiment.id, experiment.claimId),
          kind: "EXPERIMENT_FOR",
          fromNodeId: experiment.id,
          toNodeId: experiment.claimId,
          workspaceId: snapshot.workspaceId,
          branchId: experiment.branchId,
        })
      }
      for (const result of results.filter((item) => item.experimentId === experiment.id)) {
        addNode({
          id: result.id,
          kind: "EXPERIMENT_RESULT",
          workspaceId: snapshot.workspaceId,
          entityId: result.id,
          label: `${result.id} ${result.outcome}`,
          summary: result.outcome,
        })
        addEdge({
          id: edgeId("PRODUCES", experiment.id, result.id),
          kind: "PRODUCES",
          fromNodeId: experiment.id,
          toNodeId: result.id,
          workspaceId: snapshot.workspaceId,
        })
        if (experiment.claimId && nodeIds.has(experiment.claimId)) {
          const kind = result.outcome === "COUNTEREXAMPLE_FOUND" ? "COUNTEREXAMPLE_TO" : "SUPPORTS"
          addEdge({
            id: edgeId(kind, result.id, experiment.claimId),
            kind,
            fromNodeId: result.id,
            toNodeId: experiment.claimId,
            workspaceId: snapshot.workspaceId,
          })
        }
      }
    }
  }

  if (!options.proofOnly && options.includeLiterature !== false) {
    for (const source of snapshot.sources ?? []) {
      addNode({ id: source.id, kind: "SOURCE", workspaceId: snapshot.workspaceId, entityId: source.id, label: `${source.id} ${source.title}`, summary: source.status })
    }
    for (const ext of snapshot.externalResults ?? []) {
      if (branchId && ext.branchId !== branchId) continue
      addNode({ id: ext.id, kind: "EXTERNAL_RESULT", workspaceId: snapshot.workspaceId, branchId: ext.branchId, entityId: ext.id, label: `${ext.id} ${ext.name ?? ext.kind}`, summary: ext.status, origin: "LOCAL" })
      if (nodeIds.has(ext.sourceId)) {
        addEdge({ id: edgeId("EXTRACTED_FROM", ext.id, ext.sourceId), kind: "EXTRACTED_FROM", fromNodeId: ext.id, toNodeId: ext.sourceId, workspaceId: snapshot.workspaceId, branchId: ext.branchId })
      }
    }
    for (const citation of snapshot.citations ?? []) {
      if (citation.invalidated) continue
      if (branchId && citation.branchId !== branchId) continue
      addNode({ id: citation.id, kind: "CITATION", workspaceId: snapshot.workspaceId, branchId: citation.branchId, entityId: citation.id, label: `${citation.id} ${citation.purpose}`, summary: citation.purpose, origin: "LOCAL" })
      if (nodeIds.has(citation.sourceId)) addEdge({ id: edgeId("CITES", citation.id, citation.sourceId), kind: "CITES", fromNodeId: citation.id, toNodeId: citation.sourceId, workspaceId: snapshot.workspaceId, branchId: citation.branchId })
      if (citation.claimId && nodeIds.has(citation.claimId) && citation.externalResultId && nodeIds.has(citation.externalResultId)) {
        const kind = citation.purpose === "COUNTERPOINT" ? "COUNTERPOINT_FROM" : citation.purpose === "KNOWN_RESULT" ? "KNOWN_FROM" : "SUPPORTED_BY_SOURCE"
        addEdge({ id: edgeId(kind, citation.claimId, citation.externalResultId), kind, fromNodeId: citation.claimId, toNodeId: citation.externalResultId, workspaceId: snapshot.workspaceId, branchId: citation.branchId })
      }
    }
  }

  if (options.proofOnly) {
    const keep = new Set(nodes.filter((node) => PROOF_NODE_KINDS.has(node.kind)).map((node) => node.id))
    const filteredNodes = nodes.filter((node) => keep.has(node.id)).sort((a, b) => a.id.localeCompare(b.id))
    const filteredEdges = edges.filter((edge) => keep.has(edge.fromNodeId) && keep.has(edge.toNodeId)).sort((a, b) => a.id.localeCompare(b.id))
    return finish(snapshot, branchId, filteredNodes, filteredEdges)
  }

  nodes.sort((a, b) => a.id.localeCompare(b.id))
  edges.sort((a, b) => a.id.localeCompare(b.id))
  return finish(snapshot, branchId, nodes, edges)
}

function finish(snapshot: ResearchGraphSnapshot, branchId: string | null, nodes: ResearchGraphNode[], edges: ResearchGraphEdge[]): ResearchGraph {
  return {
    nodes,
    edges,
    metadata: {
      schemaVersion: "research-graph-v1",
      workspaceId: snapshot.workspaceId,
      branchId,
      builtAt: snapshot.builtAt ?? "1970-01-01T00:00:00.000Z",
      eventSequence: snapshot.eventSequence,
      graphHash: semanticGraphHash(nodes, edges),
      focusNodeId: snapshot.mainObjectiveId,
    },
  }
}

export function toProofGraph(graph: ResearchGraph): import("./types.ts").ProofGraphProjection {
  return {
    objective: graph.nodes.find((node) => node.kind === "OBJECTIVE")?.id ?? graph.metadata.focusNodeId,
    claims: graph.nodes.filter((node) => node.kind === "CLAIM" || node.kind === "OBJECTIVE"),
    dependencies: graph.edges.filter((edge) => edge.kind === "DEPENDS_ON"),
    proofs: graph.nodes.filter((node) => node.kind === "PROOF_ATTEMPT"),
    verifications: graph.nodes.filter((node) => node.kind === "VERIFICATION"),
    blockers: graph.nodes.filter((node) => node.kind === "BLOCKER"),
  }
}

export function withNotebookProjection(graph: ResearchGraph, projection: Pick<ResearchGraph, "nodes" | "edges">): ResearchGraph {
  const nodes = [...graph.nodes, ...projection.nodes].sort((a, b) => a.id.localeCompare(b.id))
  const edges = [...graph.edges, ...projection.edges].sort((a, b) => a.id.localeCompare(b.id))
  return { ...graph, nodes, edges, metadata:{ ...graph.metadata, graphHash:semanticGraphHash(nodes, edges) } }
}

import type { Claim, MultiAgentResearchSession, ResearchAgentWorker, ResearchRun, ResearchStep, SolutionCandidate } from "@mathos/domain"
import {
  buildGraphContextSummary,
  buildResearchGraph,
  buildTeamGraphContext,
  formatClaimDetail,
  formatFrontier,
  formatGraphContext,
  formatGraphDot,
  formatGraphJson,
  formatGraphMermaid,
  formatGraphTree,
  pathBetween,
  summarizeObjective,
  type ResearchGraph,
  type ResearchGraphBuildOptions,
  type ResearchGraphSnapshot,
} from "@mathos/graph"
import {
  blockerReview,
  claimPage as formatClaimPage,
  epistemicLedger,
  experimentPanel,
  formatConfigShow,
  formatEnvironmentReadiness,
  formatLedger,
  formatStatusSummary,
  literaturePanel,
  reopenSummary as formatReopenSummary,
  researchDashboard as formatResearchDashboard,
  sessionTimeline,
  whyNotVerified,
  whyVerified,
  workspaceHome as formatWorkspaceHome,
  type ProductState,
} from "../product-ux.ts"

type WorkspaceReadModel = { id: string; name: string; mainObjectiveId: string | null }

/** Read-only dependencies used to build graph and TUI projections. */
export interface ResearchQueryServiceDependencies {
  root: string
  snapshot: () => ResearchGraphSnapshot
  currentBranchId: () => string
  getTeam: (id: string) => MultiAgentResearchSession
  teamAgents: (id: string) => ResearchAgentWorker[]
  teamSolutions: (id: string) => SolutionCandidate[]
  getResearch: (id: string) => ResearchRun
  latestResearch: () => ResearchRun | null
  getClaim: (id: string) => Claim
  workspace: () => WorkspaceReadModel
  events: (workspaceId: string) => ProductState["events"]
  stepsForRun: (runId: string) => ResearchStep[]
  interruptSummary: () => string
}

export class ResearchQueryService {
  constructor(private readonly d: ResearchQueryServiceDependencies) {}

  graphSnapshot(): ResearchGraphSnapshot { return this.d.snapshot() }

  buildGraph(options: ResearchGraphBuildOptions = {}): ResearchGraph {
    const snapshot = structuredClone(this.graphSnapshot())
    if (options.teamSessionId) {
      const session = this.d.getTeam(options.teamSessionId)
      const agents = this.d.teamAgents(session.id)
      const allowed = new Set(snapshot.visibility.filter((row) => row.branchId === session.sourceBranchId || agents.some((agent) => agent.branchId === row.branchId)).map((row) => `${row.branchId}:${row.claimId}`))
      snapshot.visibility = snapshot.visibility.filter((row) => allowed.has(`${row.branchId}:${row.claimId}`))
      return buildResearchGraph(snapshot, { ...options, includeResearchRuntime: true, includeImports: true })
    }
    return buildResearchGraph(snapshot, { branchId: options.branchId ?? this.d.currentBranchId(), ...options })
  }

  graphShow(focusId?: string, options: ResearchGraphBuildOptions & { depth?: number; format?: "text" | "json" | "dot" | "mermaid" } = {}) {
    const graph = this.buildGraph({ ...options, proofOnly: options.proofOnly ?? options.format !== "json" })
    const focus = focusId ?? graph.metadata.focusNodeId
    const analysis = buildGraphContextSummary(graph, { focusClaimId: focus })
    if (options.format === "json") return formatGraphJson(graph, { ...analysis })
    if (options.format === "dot") return formatGraphDot(graph)
    if (options.format === "mermaid") return formatGraphMermaid(graph)
    return formatGraphTree(graph, focus, options.depth ?? 2)
  }

  graphDependencies(claimId: string) { return this.buildGraph().edges.filter((edge) => edge.kind === "DEPENDS_ON" && edge.fromNodeId === claimId.toUpperCase()).map((edge) => `${edge.fromNodeId} DEPENDS_ON ${edge.toNodeId}`) }
  graphDependents(claimId: string) { return this.buildGraph().edges.filter((edge) => edge.kind === "DEPENDS_ON" && edge.toNodeId === claimId.toUpperCase()).map((edge) => `${edge.fromNodeId} DEPENDS_ON ${edge.toNodeId}`) }
  graphBlockers(claimId: string) { return this.buildGraph().edges.filter((edge) => edge.kind === "BLOCKS" && edge.toNodeId === claimId.toUpperCase()).map((edge) => edge.fromNodeId) }
  graphPath(fromId: string, toId: string) { return pathBetween(this.buildGraph(), fromId.toUpperCase(), toId.toUpperCase()) }

  graphCompare(leftId: string, rightId: string) {
    const left = this.buildGraph({ branchId: leftId.toUpperCase(), includeResearchRuntime: true, includeImports: true, proofOnly: false })
    const right = this.buildGraph({ branchId: rightId.toUpperCase(), includeResearchRuntime: true, includeImports: true, proofOnly: false })
    const claims = (graph: ResearchGraph) => new Set(graph.nodes.filter((node) => node.kind === "CLAIM" || node.kind === "OBJECTIVE").map((node) => node.id))
    const leftClaims = claims(left); const rightClaims = claims(right)
    return { left: leftId.toUpperCase(), right: rightId.toUpperCase(), shared: [...leftClaims].filter((id) => rightClaims.has(id)).sort(), onlyLeft: [...leftClaims].filter((id) => !rightClaims.has(id)).sort(), onlyRight: [...rightClaims].filter((id) => !leftClaims.has(id)).sort(), leftVerified: left.nodes.filter((node) => node.epistemicStatus === "KERNEL_VERIFIED").map((node) => node.id).sort(), rightVerified: right.nodes.filter((node) => node.epistemicStatus === "KERNEL_VERIFIED").map((node) => node.id).sort(), leftBlockers: left.nodes.filter((node) => node.kind === "BLOCKER").map((node) => node.id), rightBlockers: right.nodes.filter((node) => node.kind === "BLOCKER").map((node) => node.id) }
  }

  graphClaimDetail(claimId: string) { return formatClaimDetail(this.buildGraph({ includeResearchRuntime: true }), claimId.toUpperCase()) }
  researchContext(runId?: string) {
    const run = runId ? this.d.getResearch(runId) : this.d.latestResearch()
    const objectiveId = run?.objectiveClaimId ?? this.d.workspace().mainObjectiveId
    const objective = objectiveId ? this.d.getClaim(objectiveId) : null
    const graph = this.buildGraph({ branchId: run?.branchId ?? this.d.currentBranchId(), includeImports: true })
    const summary = buildGraphContextSummary(graph, { focusClaimId: run?.strategy.focusClaimId ?? objective?.id ?? null })
    return { run, objective, graph, summary, text: formatGraphContext(summary) }
  }
  researchProgress(runId?: string) {
    const ctx = this.researchContext(runId); const { run, objective } = ctx
    const lines = [run ? `RESEARCH RUN ${run.id}` : "WORKSPACE", `Objective ${objective?.id ?? "none"} · ${objective?.status ?? "n/a"}`, run ? `Focus ${run.strategy.focusClaimId ?? run.objectiveClaimId ?? "none"}` : `Focus ${objective?.id ?? "none"}`, `Structural frontier ${ctx.summary.unverifiedFrontier.length} claims`, `Verified prerequisites ${ctx.summary.verifiedPrerequisites.length}`, `Open blockers ${ctx.summary.openBlockingChain.length}`, `Computational evidence ${ctx.summary.computationalEvidence.length}`]
    if (run) lines.push(`Steps ${run.usage.steps} / ${run.limits.maxSteps}`, `Lean ${run.usage.leanCalls} / ${run.limits.maxLeanCalls}`, `Model ${run.usage.modelCalls} / ${run.limits.maxModelCalls}`)
    lines.push(summarizeObjective(ctx.graph, objective?.id ?? ctx.summary.objectiveClaimId ?? "none")); return lines.join("\n")
  }
  graphFrontier(claimId?: string) { const graph = this.buildGraph({ includeImports: true }); const summary = buildGraphContextSummary(graph, { focusClaimId: claimId?.toUpperCase() ?? graph.metadata.focusNodeId }); return { text: formatFrontier(summary), summary } }
  graphBlockingChain(claimId: string) { return buildGraphContextSummary(this.buildGraph({ includeImports: true }), { focusClaimId: claimId.toUpperCase() }).openBlockingChain }
  graphSupport(claimId: string) { return buildGraphContextSummary(this.buildGraph({ includeImports: true }), { focusClaimId: claimId.toUpperCase() }).verifiedPrerequisites }
  graphUnresolved(claimId: string) { return buildGraphContextSummary(this.buildGraph({ includeImports: true }), { focusClaimId: claimId.toUpperCase() }).unverifiedFrontier }
  teamGraphContext(sessionId: string) { const session = this.d.getTeam(sessionId); const agents = this.d.teamAgents(session.id); return buildTeamGraphContext({ graph: this.buildGraph({ teamSessionId: session.id, includeResearchRuntime: true, includeImports: true, proofOnly: false }), workers: agents.map((agent) => ({ agentId: agent.id, branchId: agent.branchId, focusClaimId: this.d.getResearch(agent.researchRunId).strategy.focusClaimId ?? null, localClaimId: agent.localClaimId })), solutions: this.d.teamSolutions(session.id).map((item) => item.claimId) }) }

  productState(): ProductState { const workspace = this.d.workspace(); const snapshot = this.graphSnapshot(); return { projectName: workspace.name, workspaceRoot: this.d.root, snapshot, events: this.d.events(workspace.id), steps: snapshot.runs.flatMap((run) => this.d.stepsForRun(run.id)) } }
  workspaceHome() { return formatWorkspaceHome(this.productState()) }
  statusSummary() { return formatStatusSummary(this.productState()) }
  reopenSummary() { const extra = this.d.interruptSummary(); const base = formatReopenSummary(this.productState()); return extra ? `${extra}\n\n${base}` : base }
  researchDashboard() { return formatResearchDashboard(this.productState()) }
  claimPage(id: string) { return formatClaimPage(this.productState(), id) }
  whyClaim(id: string) { const state = this.productState(); const claim = state.snapshot.claims.find((item) => item.id === id); return claim?.status === "KERNEL_VERIFIED" ? whyVerified(state, id) : whyNotVerified(state, id) }
  ledger(id: string) { return epistemicLedger(this.productState(), id) }
  ledgerText(id: string) { return formatLedger(this.ledger(id)) }
  timeline(filter = "all") { return sessionTimeline(this.productState(), filter) }
  blockersPanel() { return blockerReview(this.productState()) }
  experimentsPanel() { return experimentPanel(this.productState()) }
  literatureHome() { return literaturePanel(this.productState()) }
  environmentReadinessText(checks: Array<{ name: string; status: string; detail: string }>) { return formatEnvironmentReadiness(checks) }
  configShow() { return formatConfigShow(this.d.root) }
}

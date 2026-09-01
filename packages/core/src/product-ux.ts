import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { ResearchGraphSnapshot } from "@mathos/graph"
import { buildResearchGraph, unverifiedFrontier, blockingChain } from "@mathos/graph"
import type { Claim, ResearchEvent, ResearchRun, ResearchStep, VerificationRun } from "@mathos/domain"
import { resolveModelConfig } from "@mathos/models"
import { isMathOSError } from "@mathos/shared"

export const TYPED_ERROR_HELP: Record<string, string> = {
  PLANNER_UNAVAILABLE: "The AI research planner is not configured. Lean and manual commands still work.",
  MODEL_PROVIDER_UNAVAILABLE: "No model credentials. Core, Lean, graph, and experiments remain available.",
  LEAN_TIMEOUT: "Lean exceeded the step wall-clock. Retry with a smaller goal or raise the step timeout.",
  LOCAL_LEAN_BUDGET_EXHAUSTED: "This research run used its Lean call budget. Pause or start a new run.",
  SOURCE_NOT_KERNEL_VERIFIED: "A literature source is not a kernel proof. Cite it as EXTERNAL_KNOWN, then prove.",
  UNSUPPORTED_EXTRACTION: "The excerpt is not grounded (missing locator or text). Provide a bounded excerpt.",
  WorkspaceAlreadyInitialized: "This directory already has a MathOS workspace. Open it instead of re-init.",
  WorkspaceNotFound: "No workspace here. Run mathos init first.",
  LEAN_CALL_BUDGET_EXHAUSTED: "Lean call budget exhausted for this run.",
}

export function formatTypedUserError(error: unknown): { message: string; code: string; explanation: string; text: string } {
  const code = isMathOSError(error) ? error.code : error instanceof Error && /BUDGET|TIMEOUT|PLANNER|UNSUPPORTED|SOURCE_NOT/.test(error.message) ? error.message.split(":")[0] ?? "ERROR" : "ERROR"
  const message = isMathOSError(error) ? error.message : error instanceof Error ? error.message : "An unexpected error occurred."
  const explanation = TYPED_ERROR_HELP[code] ?? TYPED_ERROR_HELP[message] ?? "See the error code for debugging. Stack traces stay hidden unless MATHOS_DEBUG=1."
  return { message, code, explanation, text: `${message}\n${explanation}\nError code: ${code}` }
}

function formatLocator(locator: { kind: string } | null | undefined): string {
  if (!locator) return "UNKNOWN"
  const rec = locator as Record<string, unknown>
  if (locator.kind === "PAGE") return `PAGE ${rec.pageStart ?? ""}`
  if (locator.kind === "SECTION") return `SECTION ${rec.section ?? ""}`
  if (locator.kind === "THEOREM") return `THEOREM ${rec.theorem ?? ""}`
  if (locator.kind === "EQUATION") return `EQUATION ${rec.equation ?? ""}`
  if (locator.kind === "URL_FRAGMENT") return `URL_FRAGMENT ${rec.fragment ?? ""}`
  return locator.kind
}

export function inspectHostEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const lean = spawnSync("lean", ["--version"], { encoding: "utf8" })
  const python = spawnSync("python3", ["--version"], { encoding: "utf8" })
  const git = spawnSync("git", ["--version"], { encoding: "utf8" })
  const sympy = spawnSync("python3", ["-c", "import sympy"], { encoding: "utf8" })
  const model = resolveModelConfig({ env })
  return {
    lean: lean.status === 0 ? { status: "PASS" as const, detail: (lean.stdout || lean.stderr).trim().split("\n")[0] ?? "detected" } : { status: "BLOCKING" as const, detail: "Lean not on PATH" },
    mathlib: { status: "OPTIONAL_MISSING" as const, detail: "pinned per workspace formal project" },
    python: python.status === 0 ? { status: "PASS" as const, detail: (python.stdout || python.stderr).trim() } : { status: "OPTIONAL_MISSING" as const, detail: "python3 not on PATH" },
    sympy: sympy.status === 0 ? { status: "PASS" as const, detail: "available" } : { status: "OPTIONAL_MISSING" as const, detail: "optional missing" },
    model: model.apiKey && model.model ? { status: "PASS" as const, detail: `${model.provider} ${model.model}` } : { status: "OPTIONAL_MISSING" as const, detail: "MODEL_PROVIDER_UNAVAILABLE" },
    literature: { status: "PASS" as const, detail: "local sources" },
    openalex: { status: "OPTIONAL_MISSING" as const, detail: "optional (no live request)" },
    git: git.status === 0 ? { status: "PASS" as const, detail: (git.stdout || "").trim() } : { status: "WARNING" as const, detail: "git missing" },
  }
}

export function formatInitReport(name: string, root: string, host = inspectHostEnvironment()): string {
  const mark = (status: string) => (status === "PASS" ? "✓" : status === "BLOCKING" ? "×" : "○")
  return [
    "MathOS",
    "",
    "Create research workspace",
    "",
    `Name`,
    `  ${name}`,
    "",
    "Directory",
    `  ${root}`,
    "",
    "Formal environment",
    `${mark(host.lean.status)} Lean ${host.lean.detail}`,
    `${mark(host.mathlib.status)} Mathlib project (workspace-local)`,
    "",
    "Optional computation",
    `${mark(host.python.status)} Python ${host.python.detail}`,
    `${mark(host.sympy.status)} SymPy ${host.sympy.detail}`,
    "",
    "Literature",
    `${mark(host.literature.status)} local sources`,
    `${mark(host.openalex.status)} OpenAlex ${host.openalex.detail}`,
    "",
    host.model.status === "PASS" ? `Model ${host.model.detail}` : "Model  ○ missing — AI planner optional",
    "",
    "Ready.",
  ].join("\n")
}

export function formatEnvironmentReadiness(doctorChecks: Array<{ name: string; status: string; detail: string }>, host = inspectHostEnvironment()): string {
  const line = (label: string, item: { status: string; detail: string }) => {
    const glyph = item.status === "PASS" ? "✓" : item.status === "BLOCKING" || item.status === "FAIL" ? "×" : "○"
    return `${label.padEnd(12)} ${glyph}  ${item.detail}`
  }
  const lean = doctorChecks.find((item) => item.name === "Lean")
  const mathlib = doctorChecks.find((item) => item.name === "Mathlib")
  return [
    "ENVIRONMENT",
    "",
    line("Lean", lean ? { status: lean.status, detail: lean.detail } : host.lean),
    line("Mathlib", mathlib ? { status: mathlib.status, detail: mathlib.detail } : host.mathlib),
    line("Python", host.python),
    line("SymPy", host.sympy),
    line("Model", host.model),
    line("Literature", host.literature),
    line("OpenAlex", host.openalex),
    line("Git", host.git),
  ].join("\n")
}

export interface ProductState {
  projectName: string
  workspaceRoot: string
  snapshot: ResearchGraphSnapshot
  events: ResearchEvent[]
  steps: ResearchStep[]
  doctorChecks?: Array<{ name: string; status: string; detail: string }>
}

function latestRun(state: ProductState): ResearchRun | null {
  return state.snapshot.runs.at(-1) ?? null
}

function objective(state: ProductState): Claim | null {
  const id = state.snapshot.mainObjectiveId
  return id ? state.snapshot.claims.find((item) => item.id === id) ?? null : null
}

function kernelCount(state: ProductState): number {
  return state.snapshot.claims.filter((item) => item.status === "KERNEL_VERIFIED").length
}

export function workspaceHome(state: ProductState): string {
  const obj = objective(state)
  const run = latestRun(state)
  const graph = buildResearchGraph(state.snapshot, { branchId: state.snapshot.branches.find((item) => item.isCurrent)?.id })
  const frontier = unverifiedFrontier(graph, obj?.id)
  const openBlockers = state.snapshot.blockers.filter((item) => item.status === "OPEN")
  const team = state.snapshot.sessions.at(-1)
  const formal = obj ? state.snapshot.formals.find((item) => item.claimId === obj.id && item.isCurrent) : null
  const empty = !obj
  return [
    "MATHOS",
    "",
    "Workspace",
    state.projectName,
    "",
    "MAIN OBJECTIVE",
    obj ? obj.id : "none",
    obj ? obj.title : "No research objective yet.",
    obj ? obj.status : "",
    "",
    "Objective",
    obj ? `${obj.id}` : "none",
    "",
    "Status",
    obj?.status ?? "—",
    "",
    "Formalization",
    formal?.fidelityStatus ?? "Not created",
    "",
    "Research",
    run ? `${run.id} · ${run.status}` : "No active session",
    "",
    "Graph",
    `${state.snapshot.claims.length} claims`,
    `${kernelCount(state)} verified`,
    `${frontier.length} frontier`,
    `${openBlockers.length} blocker`,
    "",
    "Team",
    team ? `${team.id} ${team.status}` : "No active session",
    "",
    "Computation",
    `${state.snapshot.experiments?.length ?? 0} experiments`,
    "",
    "Literature",
    `${state.snapshot.sources?.length ?? 0} sources`,
    `${state.snapshot.citations?.length ?? 0} cited results`,
    "",
    empty ? "No research objective yet.\n\nCreate one to begin." : "Primary actions: research · objective · graph · claims · experiments · literature · team · blockers · history",
  ].join("\n")
}

export function formatStatusSummary(state: ProductState, host = inspectHostEnvironment()): string {
  const obj = objective(state)
  const run = latestRun(state)
  const graph = buildResearchGraph(state.snapshot, { branchId: state.snapshot.branches.find((item) => item.isCurrent)?.id })
  const frontier = unverifiedFrontier(graph, obj?.id)
  const team = state.snapshot.sessions.at(-1)
  const mark = (item: { status: string }) => (item.status === "PASS" ? "✓" : "○")
  return [
    "MATHOS WORKSPACE",
    "",
    "Objective",
    obj?.id ?? "none",
    "",
    "Status",
    obj?.status ?? "—",
    "",
    "Research",
    run ? `${run.id} ${run.status}` : "none",
    "",
    "Claims",
    `${state.snapshot.claims.length} total`,
    `${kernelCount(state)} kernel verified`,
    `${frontier.length} frontier`,
    `${state.snapshot.blockers.filter((item) => item.status === "OPEN").length} blocked`,
    "",
    "Evidence",
    `${state.snapshot.experiments?.length ?? 0} computation`,
    `${state.snapshot.citations?.length ?? 0} citations`,
    "",
    "Team",
    team ? `${team.id} ${team.status}` : "none",
    "",
    "Environment",
    `Lean ${mark(host.lean)}`,
    `Python ${mark(host.python)}`,
    `Model ${mark(host.model)}`,
  ].join("\n")
}

export function reopenSummary(state: ProductState): string {
  const obj = objective(state)
  const run = latestRun(state)
  const last = state.steps.at(-1)
  const open = state.snapshot.blockers.filter((item) => item.status === "OPEN")
  return [
    "WELCOME BACK",
    "",
    "Objective",
    obj?.id ?? "none",
    "",
    "Last session",
    run ? `${run.id} ${run.status}` : "none",
    "",
    "Current focus",
    run?.strategy.focusClaimId ?? obj?.id ?? "none",
    "",
    "Open blockers",
    String(open.length),
    "",
    "Last activity",
    last ? `${last.action} ${last.status}${last.summary ? ` · ${last.summary}` : ""}` : "none",
    "",
    "Resume?",
    "Opening the workspace does not call a model. Resume is an explicit action.",
  ].join("\n")
}

export function researchDashboard(state: ProductState): string {
  const run = latestRun(state)
  const obj = objective(state)
  if (!run) return "RESEARCH\n\nNo research run.\nStart research from the home screen."
  const graph = buildResearchGraph(state.snapshot, { branchId: run.branchId })
  const frontier = unverifiedFrontier(graph, obj?.id)
  const open = state.snapshot.blockers.filter((item) => item.status === "OPEN")
  const verified = state.snapshot.claims.filter((item) => item.status === "KERNEL_VERIFIED")
  const recent = state.steps.filter((item) => item.runId === run.id).slice(-8)
  return [
    `RESEARCH · ${run.id}`,
    "",
    "Objective",
    obj?.id ?? run.objectiveClaimId ?? "none",
    "",
    "Status",
    run.status,
    "",
    "Focus",
    run.strategy.focusClaimId ?? "none",
    "",
    "Structural frontier",
    frontier.join("\n") || "none",
    "",
    "Open blockers",
    open.map((item) => `${item.id} ${item.type}`).join("\n") || "none",
    "",
    "Verified support",
    verified.map((item) => item.id).join("\n") || "none",
    "",
    "Recent steps",
    recent.map((item) => `${item.id} ${item.action.padEnd(18)} ${item.status === "FAILED" ? "×" : "✓"}`).join("\n") || "none",
    "",
    "Budget",
    `Steps ${run.usage.steps}/${run.limits.maxSteps}`,
    `Model ${run.usage.modelCalls}/${run.limits.maxModelCalls}`,
    `Lean  ${run.usage.leanCalls}/${run.limits.maxLeanCalls}`,
    "",
    "s step   r run bounded   p pause   g graph   b blockers   h history   Esc",
  ].join("\n")
}

export function blockerReview(state: ProductState): string {
  const graph = buildResearchGraph(state.snapshot)
  const rows = state.snapshot.blockers
  if (!rows.length) return "BLOCKERS\n\nNo blockers."
  return [
    "BLOCKERS",
    "",
    ...rows.flatMap((item) => {
      const chain = blockingChain(graph, item.id)
      return [
        item.id,
        item.type,
        "",
        "Claim",
        item.claimId ?? "none",
        "",
        "Created",
        item.createdByStepId ?? item.createdAt,
        "",
        "Affects",
        chain.join("\n") || item.claimId || "none",
        "",
        "Status",
        item.status,
        item.summary ? `\nQuestion\n${item.summary}` : "",
        item.humanResponse ? `\nAnswer\n${item.humanResponse}` : "",
        "",
      ]
    }),
  ].join("\n")
}

export function claimPage(state: ProductState, claimId: string): string {
  const claim = state.snapshot.claims.find((item) => item.id === claimId)
  if (!claim) return `Claim ${claimId} was not found.`
  const formal = state.snapshot.formals.find((item) => item.claimId === claim.id && item.isCurrent)
  const proofs = state.snapshot.proofs.filter((item) => item.claimId === claim.id)
  const failed = [...proofs].reverse().find((item) => item.status === "FAILED")
  const vr = state.snapshot.verifications.filter((item) => item.claimId === claim.id).at(-1)
  const deps = state.snapshot.dependencies.filter((item) => item.fromClaimId === claim.id)
  const experiments = (state.snapshot.experiments ?? []).filter((item) => item.claimId === claim.id)
  const citations = (state.snapshot.citations ?? []).filter((item) => item.claimId === claim.id)
  const vis = state.snapshot.visibility.find((item) => item.claimId === claim.id)
  return [
    `CLAIM · ${claim.id}`,
    "",
    "Statement",
    claim.naturalStatement,
    "",
    "Status",
    claim.status,
    "",
    "Origin",
    `${vis?.relation ?? "LOCAL"} · ${vis?.branchId ?? "B-000"}`,
    "",
    "Formal statement",
    formal?.id ?? "none",
    "",
    "Fidelity",
    formal?.fidelityStatus ?? "Not created",
    "",
    "Dependencies",
    deps.map((item) => {
      const target = state.snapshot.claims.find((c) => c.id === item.toClaimId)
      return `${item.toClaimId} ${target?.status === "KERNEL_VERIFIED" ? "✓" : "○"}`
    }).join("\n") || "none",
    "",
    "Proof attempts",
    String(proofs.length),
    "",
    "Last failure",
    failed ? failed.diagnostics.map((item) => item.message).join("; ") || "FAILED" : "none",
    "",
    "Verification",
    vr ? `${vr.id} ${vr.result}` : "None",
    "",
    "Evidence",
    `${experiments.length} computational`,
    `${citations.length} literature`,
  ].join("\n")
}

function gateChecks(vr: VerificationRun | undefined): Array<{ name: string; status: string; detail?: string }> {
  if (!vr) return []
  try {
    const parsed = JSON.parse(vr.gateJson) as Array<{ name: string; status: string; detail?: string }>
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function verificationDetail(state: ProductState, claimId: string): string {
  const claim = state.snapshot.claims.find((item) => item.id === claimId)
  const vr = state.snapshot.verifications.filter((item) => item.claimId === claimId).at(-1)
  const formal = state.snapshot.formals.find((item) => item.claimId === claimId && item.isCurrent)
  if (!vr) return `VERIFICATION\n\nNo VerificationGate run for ${claimId}.`
  return [
    `VERIFICATION · ${vr.id}`,
    "",
    "Claim",
    claimId,
    "",
    "Result",
    vr.result,
    "",
    "Final status",
    claim?.status ?? "—",
    "",
    "Formal revision",
    formal?.id ?? vr.formalStatementId,
    "",
    "Lean",
    vr.leanVersion ?? "unknown",
    "",
    "Mathlib",
    "pinned per workspace",
    "",
    "Axiom audit",
    gateChecks(vr).find((item) => item.name === "custom axioms")?.status ?? "n/a",
    "",
    "Forbidden constructs",
    gateChecks(vr).find((item) => item.name === "forbidden constructs")?.status ?? "n/a",
    "",
    "Fidelity",
    vr.fidelityStatus ?? formal?.fidelityStatus ?? "—",
  ].join("\n")
}

export function whyVerified(state: ProductState, claimId: string): string {
  const claim = state.snapshot.claims.find((item) => item.id === claimId)
  const vr = state.snapshot.verifications.filter((item) => item.claimId === claimId && item.result === "KERNEL_ACCEPTED").at(-1)
  if (claim?.status !== "KERNEL_VERIFIED" || !vr) {
    return whyNotVerified(state, claimId)
  }
  const checks = gateChecks(vr)
  const line = (name: string, fallback: string) => {
    const hit = checks.find((item) => item.name === name)
    return `✓ ${hit ? `${hit.name}${hit.detail ? ` ${hit.detail}` : ""}` : fallback}`
  }
  return [
    "Why KERNEL_VERIFIED?",
    "",
    line("current revision", "Current formal revision"),
    line("fidelity", "Fidelity HUMAN_APPROVED"),
    line("proof compiles", "Native Lean compilation"),
    line("forbidden constructs", "Forbidden construct check"),
    line("custom axioms", "Axiom audit"),
    "✓ VerificationGate PASS",
    "",
    `Provenance ${vr.id}`,
    "This is deterministic provenance. No generated reasoning.",
  ].join("\n")
}

export function whyNotVerified(state: ProductState, claimId: string): string {
  const claim = state.snapshot.claims.find((item) => item.id === claimId)
  const formal = state.snapshot.formals.find((item) => item.claimId === claimId && item.isCurrent)
  const proofs = state.snapshot.proofs.filter((item) => item.claimId === claimId)
  const open = state.snapshot.blockers.filter((item) => item.claimId === claimId && item.status === "OPEN")
  const accepted = proofs.some((item) => item.status === "KERNEL_ACCEPTED")
  const vr = state.snapshot.verifications.filter((item) => item.claimId === claimId).at(-1)
  return [
    "WHY NOT VERIFIED?",
    "",
    `Formalization ${formal ? "✓" : "×"}`,
    `Fidelity ${formal?.fidelityStatus === "HUMAN_APPROVED" ? "✓" : "×"}`,
    `Proof attempt ${accepted ? "✓" : proofs.length ? "×" : "×"}`,
    open.length ? `Open blocker ${open.map((item) => item.id).join(", ")}` : "Open blocker none",
    vr && vr.result !== "KERNEL_ACCEPTED" ? `VerificationGate ${vr.result}` : "VerificationGate none",
    "",
    claim ? `Current status ${claim.status}` : `Claim ${claimId} missing`,
    "KERNEL_VERIFIED requires VerificationGate. Computation and literature are not proofs.",
  ].join("\n")
}

export interface EpistemicLedgerEntry {
  entityId: string
  timestamp: string
  fromStatus?: string
  toStatus?: string
  reason: string
  actor: "USER" | "SYSTEM" | "MODEL" | "VERIFICATION_GATE" | "IMPORT" | "EXPERIMENT" | "LITERATURE"
  provenanceIds: string[]
}

export function epistemicLedger(state: ProductState, entityId: string): EpistemicLedgerEntry[] {
  const related = state.events.filter((event) => event.target === entityId || String(event.metadata.claim_id ?? event.metadata.claimId ?? "") === entityId)
  const entries: EpistemicLedgerEntry[] = related.map((event) => {
    const actor =
      event.action.includes("verification") || event.action === "claim_kernel_verified" ? "VERIFICATION_GATE" as const
      : event.action.includes("experiment") ? "EXPERIMENT" as const
      : event.action.includes("source") || event.action.includes("citation") || event.action.includes("literature") ? "LITERATURE" as const
      : event.action.includes("import") ? "IMPORT" as const
      : event.actor.type === "model" ? "MODEL" as const
      : event.actor.type === "user" ? "USER" as const
      : "SYSTEM" as const
    const toStatus =
      event.action === "claim_kernel_verified" || event.action === "verification_passed" ? "KERNEL_VERIFIED"
      : event.action.includes("experiment") && event.action.includes("succeeded") ? "COMPUTATIONALLY_SUPPORTED"
      : event.action.includes("formal") ? "FORMALIZED_UNVERIFIED"
      : event.action === "claim_created" ? "CONJECTURE"
      : event.action.includes("external") ? "EXTERNAL_KNOWN"
      : undefined
    return {
      entityId,
      timestamp: event.timestamp,
      toStatus,
      reason: event.action,
      actor,
      provenanceIds: [event.eventId, event.target].filter(Boolean) as string[],
    }
  })
  if (!entries.length) {
    return [{ entityId, timestamp: "", reason: "UNKNOWN_OR_LEGACY", actor: "SYSTEM", provenanceIds: [] }]
  }
  return entries
}

export function formatLedger(entries: EpistemicLedgerEntry[]): string {
  return ["LEDGER", "", ...entries.map((item) => `${item.timestamp} ${item.actor} ${item.reason}${item.toStatus ? ` → ${item.toStatus}` : ""} ${item.provenanceIds.join(" ")}`)].join("\n")
}

export function sessionTimeline(state: ProductState, filter: string = "all"): string {
  const rows = state.events.filter((event) => {
    if (filter === "all") return true
    if (filter === "claims") return event.action.includes("claim")
    if (filter === "proof") return event.action.includes("proof") || event.action.includes("verification")
    if (filter === "research") return event.action.includes("research")
    if (filter === "computation") return event.action.includes("experiment")
    if (filter === "literature") return event.action.includes("source") || event.action.includes("citation") || event.action.includes("literature")
    if (filter === "team") return event.action.includes("team") || event.action.includes("agent") || event.action.includes("import")
    return true
  })
  return [
    "TIMELINE",
    "",
    ...rows.map((event) => `${event.timestamp.slice(11, 16) || event.timestamp} ${event.action} ${event.target ?? ""}`.trim()),
  ].join("\n")
}

export function experimentPanel(state: ProductState): string {
  const rows = state.snapshot.experiments ?? []
  if (!rows.length) return "EXPERIMENTS\n\nNo experiments.\nPython runtime is required for live runs. Missing runtime is optional."
  return [
    "EXPERIMENTS",
    "",
    ...rows.map((item) => `${item.id}  ${item.kind}   ${item.status}`),
    "",
    "COMPUTATIONAL EVIDENCE — NOT PROOF",
  ].join("\n")
}

export function experimentDetail(state: ProductState, id: string): string {
  const exp = (state.snapshot.experiments ?? []).find((item) => item.id === id)
  if (!exp) return `Experiment ${id} was not found.`
  const result = (state.snapshot.experimentResults ?? []).filter((item) => item.experimentId === id).at(-1)
  return [
    `EXPERIMENT · ${exp.id}`,
    "",
    "Claim",
    exp.claimId ?? "none",
    "",
    "Result",
    result?.outcome ?? exp.status,
    "",
    "Witness",
    result ? JSON.stringify(result.structuredOutput) : "none",
    "",
    "Meaning",
    "COMPUTATIONAL EVIDENCE — NOT PROOF",
    "",
    "Runtime",
    exp.runtime.adapter,
    "",
    "Code hash",
    exp.codeHash,
    "",
    "Result",
    result?.id ?? "none",
  ].join("\n")
}

export function literaturePanel(state: ProductState): string {
  return [
    "LITERATURE",
    "",
    `Sources      ${state.snapshot.sources?.length ?? 0}`,
    `External     ${state.snapshot.externalResults?.length ?? 0}`,
    `Citations    ${state.snapshot.citations?.length ?? 0}`,
    "",
    "EXTERNAL SOURCE — NOT KERNEL VERIFIED",
  ].join("\n")
}

export function sourceDetail(state: ProductState, id: string): string {
  const source = (state.snapshot.sources ?? []).find((item) => item.id === id)
  if (!source) return `Source ${id} was not found.`
  const excerpts = (state.snapshot.excerpts ?? []).filter((item) => item.sourceId === id)
  const results = (state.snapshot.externalResults ?? []).filter((item) => item.sourceId === id)
  const citations = (state.snapshot.citations ?? []).filter((item) => item.sourceId === id)
  return [
    `SOURCE · ${source.id}`,
    source.title,
    source.fingerprint,
    "",
    "Excerpts",
    excerpts.map((item) => item.id).join("\n") || "none",
    "",
    "External results",
    results.map((item) => item.id).join("\n") || "none",
    "",
    "Citations",
    citations.map((item) => item.id).join("\n") || "none",
  ].join("\n")
}

export function externalResultDetail(state: ProductState, id: string): string {
  const ext = (state.snapshot.externalResults ?? []).find((item) => item.id === id)
  if (!ext) return `External result ${id} was not found.`
  const citation = (state.snapshot.citations ?? []).find((item) => item.externalResultId === ext.id)
  return [
    `EXTERNAL · ${ext.id}`,
    ext.kind,
    "",
    "Grounding",
    ext.sourceId,
    citation ? formatLocator(citation.locator) : "locator unknown",
    citation?.excerptId ?? "no excerpt",
    "",
    "EXTERNAL_KNOWN ≠ KERNEL_VERIFIED",
  ].join("\n")
}

export function emptyStates(kind: "objective" | "formalization" | "model" | "python"): string {
  if (kind === "objective") return "No research objective yet.\n\nCreate one to begin."
  if (kind === "formalization") return "No formalization yet.\n\nSuggested next action: Formalize"
  if (kind === "model") return "AI planner unavailable.\nLean/manual commands remain available."
  return "Python runtime missing.\nExperiments cannot run until python3 is on PATH."
}

export function formatConfigShow(workspaceRoot?: string): string {
  const config = resolveModelConfig({ workspaceRoot })
  return [
    "MATHOS CONFIG",
    "",
    `provider configured    ${config.provider}`,
    `model configured       ${config.model || "no"}`,
    `credentials present    ${config.apiKey ? "yes" : "no"}`,
    `base url               ${config.baseUrl}`,
    "",
    "Secrets are never printed.",
  ].join("\n")
}

export function researchReportMarkdown(state: ProductState): string {
  const obj = objective(state)
  const formal = obj ? state.snapshot.formals.find((item) => item.claimId === obj.id && item.isCurrent) : null
  const vr = obj ? state.snapshot.verifications.filter((item) => item.claimId === obj.id).at(-1) : null
  const verified = state.snapshot.claims.filter((item) => item.status === "KERNEL_VERIFIED")
  const open = state.snapshot.claims.filter((item) => item.status !== "KERNEL_VERIFIED")
  const blockers = state.snapshot.blockers.filter((item) => item.status === "OPEN")
  const citations = state.snapshot.citations ?? []
  return [
    `# Objective`,
    obj ? `${obj.id} ${obj.title}` : "none",
    obj?.naturalStatement ?? "",
    "",
    `# Current Status`,
    obj?.status ?? "UNVERIFIED",
    "",
    `# Formalization`,
    formal ? `${formal.id} ${formal.declarationName} fidelity ${formal.fidelityStatus}` : "none",
    "",
    `# Verification`,
    vr ? `${vr.id} ${vr.result} gate ${vr.id}` : "none",
    vr?.result === "KERNEL_ACCEPTED" ? "VerificationGate provenance included" : "No VerificationGate PASS",
    "",
    `# Verified Claims`,
    ...verified.map((item) => `- ${item.id} KERNEL_VERIFIED`),
    verified.length ? "" : "none",
    `# Open Claims`,
    ...open.map((item) => `- ${item.id} ${item.status}`),
    "",
    `# Dependency / Proof Structure`,
    ...state.snapshot.dependencies.map((item) => `- ${item.fromClaimId} depends_on ${item.toClaimId}`),
    "",
    `# Open Blockers`,
    ...blockers.map((item) => `- ${item.id} ${item.type} ${item.claimId ?? ""}`),
    blockers.length ? "" : "none",
    `# Computational Evidence`,
    "COMPUTATIONALLY_SUPPORTED is not KERNEL_VERIFIED. Computation ≠ proof.",
    ...(state.snapshot.experiments ?? []).map((item) => `- ${item.id} ${item.status} COMPUTATIONALLY_SUPPORTED (not proof)`),
    "",
    `# Literature / Citations`,
    "EXTERNAL_KNOWN is not KERNEL_VERIFIED. Citation ≠ proof.",
    ...citations.map((item) => {
      const source = (state.snapshot.sources ?? []).find((s) => s.id === item.sourceId)
      return `- ${item.id} ${source?.title ?? item.sourceId} ${formatLocator(item.locator)} excerpt ${item.excerptId ?? "none"}`
    }),
    "",
    `# Research Runs`,
    ...state.snapshot.runs.map((item) => `- ${item.id} ${item.status} steps ${item.usage.steps}`),
    "",
    `# Team Findings`,
    ...state.snapshot.sessions.map((item) => `- ${item.id} ${item.status}`),
    state.snapshot.sessions.length ? "" : "none",
    `# Provenance / Environment`,
    `workspace ${state.workspaceRoot}`,
    `events ${state.events.length}`,
    "Trust labels: KERNEL_VERIFIED | EXTERNAL_KNOWN | COMPUTATIONALLY_SUPPORTED | UNVERIFIED",
    "",
  ].join("\n")
}

export function suggestedNextActions(state: ProductState): string[] {
  const obj = objective(state)
  if (!obj) return ["Create objective"]
  const formal = state.snapshot.formals.find((item) => item.claimId === obj.id && item.isCurrent)
  if (!formal) return ["Formalize", "Start research", "Add source", "Run experiment"]
  if (obj.status !== "KERNEL_VERIFIED") return ["Start research", "Prove", "Review blockers"]
  return ["Open graph", "Export report"]
}

export function writeReport(state: ProductState, format: "md" | "json", dir: string): { path: string; body: string } {
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replaceAll(":", "").slice(0, 15)
  const body = format === "json" ? JSON.stringify({ markdown: researchReportMarkdown(state), state: { claims: state.snapshot.claims.map((item) => ({ id: item.id, status: item.status })) } }, null, 2) : researchReportMarkdown(state)
  const path = join(dir, `research-report-${stamp}.${format === "json" ? "json" : "md"}`)
  writeFileSync(path, body)
  return { path, body }
}

export const PALETTE_COMMANDS = [
  { name: "objective", description: "Open objective" },
  { name: "graph", description: "Open graph" },
  { name: "research", description: "Start research" },
  { name: "resume", description: "Resume research" },
  { name: "experiment", description: "Experiments" },
  { name: "literature", description: "Literature" },
  { name: "team", description: "Team" },
  { name: "doctor", description: "Doctor" },
  { name: "claims", description: "Claims" },
  { name: "history", description: "History" },
]

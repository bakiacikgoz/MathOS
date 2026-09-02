import type { BranchDetail, Claim, ClaimDetail, DoctorReport, MergePreview, ResearchBranch, StatusProjection } from "@mathos/domain"
import { branchGlyph } from "@mathos/domain"
import type { ProviderDescriptor, ProviderPolicyResult } from "@mathos/models"

export const TRUST_LANGUAGE = [
  "KERNEL_VERIFIED",
  "FORMAL_PROOF_FAILED",
  "HUMAN_APPROVAL_REQUIRED",
  "COMPUTATIONAL_EVIDENCE",
  "EXTERNAL_SOURCE",
  "CANDIDATE_CONJECTURE",
  "STALE",
  "BLOCKED",
] as const

export function formatLongOperation(input: { label: string; elapsedMs: number; checkpoint?: string | null }): string {
  return [
    input.label,
    `Elapsed ${(input.elapsedMs / 1000).toFixed(1)}s`,
    `Last durable checkpoint: ${input.checkpoint ?? "none"}`,
    "Ctrl+C to cancel · retry resumes from the last durable checkpoint",
  ].join("\n")
}

export const HELP_TEXT = `MathOS commands

  /claim       Create a mathematical claim
  /claims      Browse research claims
  /objective   Set the main research objective
  /branch      Create, switch, pause, or merge a research branch
  /branches    List research branches
  /status      Show workspace research status
  /doctor      Check workspace and toolchain integrity
  /help        This list
  /quit        Leave the session

Keys

  Enter           submit
  Shift+Enter     newline
  Tab             next field / autocomplete
  Ctrl+P          command palette
  Esc             close overlay
  Ctrl+C          quit
`

export function formatProviderCatalog(rows: Array<{ descriptor: ProviderDescriptor; policy: ProviderPolicyResult }>): string {
  return ["MODEL PROVIDERS", "", "ID                            BILLING       AUTH                 TERMS", ...rows.map(({ descriptor, policy }) => `${descriptor.id.padEnd(29)} ${descriptor.billingClass.padEnd(13)} ${(descriptor.authKinds.join(",") || "none").padEnd(20)} ${policy.code}`)].join("\n")
}

export function formatProviderStatus(row: { profile: string; descriptor: string; connection: string; model: string; billing: string; terms: string; auth: string }): string {
  return ["MODEL PROVIDER STATUS", "", `Profile     ${row.profile}`, `Descriptor  ${row.descriptor}`, `Connection  ${row.connection}`, `Model       ${row.model}`, `Billing     ${row.billing}`, `Terms       ${row.terms}`, `Auth        ${row.auth}`].join("\n")
}

export function formatStatus(status: StatusProjection): string {
  const objective = status.mainObjective
  return [
    "PROJECT",
    `  ${status.projectName}`,
    "",
    "MAIN OBJECTIVE",
    objective ? `  ${objective.id}` : "  none",
    objective ? `  ${objective.title}` : "",
    objective ? `  ${objective.status}` : "",
    "",
    "RESEARCH",
    `  claims             ${status.research.totalClaims}`,
    `  verified           ${status.research.verified}`,
    `  informal           ${status.research.informal}`,
    `  conjectures        ${status.research.conjectures}`,
    `  blocked            ${status.research.blocked}`,
    "",
    "BRANCH",
    `  ${status.branch ? `${status.branch.id}  ${status.branch.name}` : "—"}`,
    "",
    "INTEGRITY",
    `  database           ${status.integrity.database === "connected" ? "PASS" : "FAIL"}`,
    `  event log          ${status.integrity.eventLog === "ok" ? "PASS" : "FAIL"}`,
  ]
    .filter((line) => line !== "")
    .join("\n")
}

export function formatDoctor(report: DoctorReport): string {
  const width = Math.max(...report.checks.map((check) => check.name.length), 8)
  return report.checks
    .map((check) => `${check.name.padEnd(width)}    ${check.status.padEnd(4)}    ${check.detail}`)
    .join("\n")
}

export function formatClaims(claims: Claim[]): string {
  if (claims.length === 0) return "No claims yet. Use /claim to create one."
  const header = `${"ID".padEnd(8)} ${"TYPE".padEnd(12)} ${"STATUS".padEnd(22)} TITLE`
  const rows = claims.map(
    (claim) =>
      `${claim.id.padEnd(8)} ${claim.kind.padEnd(12)} ${claim.status.padEnd(22)} ${claim.title}`,
  )
  return ["CLAIMS", "", header, "─".repeat(72), ...rows].join("\n")
}

export function formatClaimDetail(detail: ClaimDetail): string {
  const evidence =
    detail.evidence.length === 0
      ? "None"
      : detail.evidence.map((item) => `${item.kind}: ${item.summary}`).join("\n")
  const dependencies =
    detail.dependencies.length === 0
      ? "None"
      : detail.dependencies.map((item) => `${item.relation} ${item.fromClaimId} → ${item.toClaimId}`).join("\n")
  return [
    detail.id,
    detail.title,
    "",
    "TYPE",
    detail.kind,
    "",
    "STATUS",
    detail.status,
    "",
    "STATEMENT",
    detail.naturalStatement,
    "",
    "EVIDENCE",
    evidence,
    "",
    "DEPENDENCIES",
    dependencies,
    "",
    "BRANCH",
    detail.branchName,
    "",
    "CREATED",
    detail.createdAt,
  ].join("\n")
}

export function formatBranches(branches: ResearchBranch[]): string {
  return ["RESEARCH BRANCHES", "", ...branches.map((branch) => `${branchGlyph(branch.status, branch.isCurrent)} ${branch.id.padEnd(6)}  ${branch.name.padEnd(24)}  ${branch.status.toLowerCase()}`)].join("\n")
}

export function formatBranchDetail(detail: BranchDetail): string {
  const branch = detail.branch
  return [
    "BRANCH",
    branch.id,
    "",
    branch.name,
    "",
    "Parent",
    detail.parent?.name ?? "—",
    "",
    "Purpose",
    branch.purpose ?? "—",
    "",
    `Local claims     ${detail.localClaims}`,
    `Inherited claims ${detail.inheritedClaims}`,
    `Proof attempts   ${detail.proofAttempts}`,
    `Blockers         ${detail.blockers}`,
    branch.staleBase ? "STALE_BASE" : "",
  ].filter(Boolean).join("\n")
}

export function formatMergePreview(preview: MergePreview): string {
  return [
    `MERGE ${preview.sourceId} → ${preview.targetId}`,
    "",
    `New claims:          ${preview.additiveClaims}`,
    `New verified lemmas: ${preview.verifiedProofs}`,
    `Formal changes:      ${preview.formalChanges}`,
    `Conflicts:           ${preview.conflicts}`,
    "",
    ...preview.items.map((item) => `${item.safe ? "✓" : "⚠️"} ${item.change} ${item.kind} ${item.id}  ${item.summary}${item.reverifyRequired ? "  REVERIFY_REQUIRED" : ""}`),
  ].join("\n")
}

export function formatResearchRun(run: import("@mathos/domain").ResearchRun, steps: Array<{ sequence: number; action: string; status: string; summary: string | null }>): string {
  return [
    `RESEARCH · ${run.id}`,
    `Branch ${run.branchId}`,
    "",
    `Objective ${run.objectiveClaimId ?? "none"}`,
    `Status ${run.status}`,
    `Step ${run.usage.steps} / ${run.limits.maxSteps}`,
    `Focus ${run.strategy.focusClaimId ?? "none"}`,
    "",
    `Model calls ${run.usage.modelCalls} / ${run.limits.maxModelCalls}`,
    `Lean calls ${run.usage.leanCalls} / ${run.limits.maxLeanCalls}`,
    `Proof attempts ${run.usage.proofAttempts} / ${run.limits.maxProofAttempts}`,
    run.stopReason ? `Stop ${run.stopReason}` : "",
    "",
    ...steps.map((step) => `${String(step.sequence).padStart(2, "0")} ${step.action.padEnd(18)} ${step.status} ${step.summary ?? ""}`),
  ].filter(Boolean).join("\n")
}

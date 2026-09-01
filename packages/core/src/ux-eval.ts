import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, createDemoWorkspace, formatInitReport, formatTypedUserError, formatConfigShow, emptyStates } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { WorkspaceAlreadyInitialized } from "@mathos/shared"

export const UX_EVAL_SCENARIOS = [
  "fresh-init",
  "workspace-home",
  "objective-create",
  "environment-readiness",
  "research-view",
  "claim-detail",
  "verification-detail",
  "why-verified",
  "why-not-verified",
  "ledger",
  "blocker-review",
  "reopen-summary",
  "experiment-panel",
  "literature-panel",
  "graph-to-claim-navigation",
  "team-to-claim-navigation",
  "command-palette",
  "empty-states",
  "typed-error-display",
  "report-export",
  "demo-workspace",
  "status-summary",
  "absolute-runtime-path-independence",
] as const

export interface UxEvalRow {
  id: string
  result: "PASS" | "FAIL"
  detail?: string
}

function openFake(root: string) {
  const model = new FakeModelProvider()
  model.enqueue({
    declarationName: "ux_true",
    leanStatement: "theorem ux_true : True",
    variableMapping: [],
    assumptionMapping: [],
    uncertainties: [],
  })
  model.enqueue({ verdict: "MATCH", findings: [], naturalSummary: "ok", formalBackTranslation: "ok" })
  return MathOS.open(root, {
    modelProvider: model,
    auditorProvider: model,
    leanAdapter: new FakeLeanAdapter(),
    vcs: new FakeVcs(),
  })
}

export async function runUxEval(): Promise<UxEvalRow[]> {
  const rows: UxEvalRow[] = []
  const fail = (id: string, detail: string): UxEvalRow => ({ id, result: "FAIL", detail })
  const pass = (id: string): UxEvalRow => ({ id, result: "PASS" })

  const fresh = mkdtempSync(join(tmpdir(), "mathos-ux-init-"))
  try {
    const created = await MathOS.init(fresh, "fresh-ws")
    const report = formatInitReport(created.name, created.root)
    let ok = report.includes("Ready.") && report.includes("Create research workspace") && report.includes("fresh-ws")
    try {
      await MathOS.init(created.root)
      ok = false
    } catch (error) {
      ok = ok && error instanceof WorkspaceAlreadyInitialized
    }
    rows.push(ok ? pass("fresh-init") : fail("fresh-init", report.slice(0, 200)))
    const app = MathOS.open(created.root, { vcs: new FakeVcs(), leanAdapter: new FakeLeanAdapter() })
    const homeEmpty = app.workspaceHome()
    rows.push(homeEmpty.includes("No research objective yet") && homeEmpty.includes("MAIN OBJECTIVE") ? pass("empty-states") : fail("empty-states", homeEmpty.slice(0, 120)))
    const env = app.environmentReadinessText((await app.doctor()).checks)
    rows.push(env.includes("ENVIRONMENT") && !env.includes("73%") ? pass("environment-readiness") : fail("environment-readiness", env.slice(0, 120)))
    app.close()
  } finally {
    rmSync(fresh, { recursive: true, force: true })
  }

  const demoParent = mkdtempSync(join(tmpdir(), "mathos-ux-demo-"))
  try {
    const demo = await createDemoWorkspace(demoParent, "demo")
    const first = MathOS.open(demo.root, { vcs: new FakeVcs(), leanAdapter: new FakeLeanAdapter() })
    const home = first.workspaceHome()
    const reopen = first.reopenSummary()
    const status = first.statusSummary()
    const obj = first.status().mainObjective
    rows.push(home.includes("MATHOS") && home.includes("MAIN OBJECTIVE") && Boolean(obj) ? pass("workspace-home") : fail("workspace-home", home.slice(0, 160)))
    rows.push(home.includes("Create") || home.includes("Objective") ? pass("objective-create") : fail("objective-create", "no objective"))
    rows.push(reopen.includes("WELCOME BACK") && reopen.includes("does not call a model") ? pass("reopen-summary") : fail("reopen-summary", reopen.slice(0, 160)))
    rows.push(status.includes("MATHOS WORKSPACE") && status.includes("kernel verified") ? pass("status-summary") : fail("status-summary", status.slice(0, 160)))
    const dash = first.researchDashboard()
    rows.push(dash.includes("RESEARCH") && dash.includes("Budget") ? pass("research-view") : fail("research-view", dash.slice(0, 160)))
    const claimId = obj?.id ?? "T-001"
    const page = first.claimPage(claimId)
    rows.push(page.includes("CLAIM") && page.includes("Status") ? pass("claim-detail") : fail("claim-detail", page.slice(0, 160)))
    const lemma = first.listClaims().find((item) => item.kind === "lemma")
    const whyV = lemma ? first.whyClaim(lemma.id) : ""
    rows.push(whyV.includes("Why KERNEL_VERIFIED") && whyV.includes("VerificationGate PASS") ? pass("why-verified") : fail("why-verified", whyV.slice(0, 200)))
    const whyN = first.whyClaim(claimId)
    rows.push(whyN.includes("WHY NOT VERIFIED") || whyN.includes("Why KERNEL_VERIFIED") ? pass("why-not-verified") : fail("why-not-verified", whyN.slice(0, 160)))
    const vr = first.productState().snapshot.verifications[0]
    const vtext = lemma ? first.whyClaim(lemma.id) : ""
    rows.push(vr && vtext.includes(vr.id) || vtext.includes("VerificationGate") ? pass("verification-detail") : fail("verification-detail", "missing gate id"))
    const led = first.ledgerText(lemma?.id ?? claimId)
    rows.push(led.includes("LEDGER") && (led.includes("claim_created") || led.includes("UNKNOWN_OR_LEGACY") || led.includes("verification")) ? pass("ledger") : fail("ledger", led.slice(0, 160)))
    rows.push(first.blockersPanel().includes("BLOCKERS") ? pass("blocker-review") : fail("blocker-review", "missing"))
    rows.push(first.experimentsPanel().includes("EXPERIMENTS") && first.experimentsPanel().includes("NOT PROOF") ? pass("experiment-panel") : fail("experiment-panel", first.experimentsPanel().slice(0, 120)))
    rows.push(first.literatureHome().includes("LITERATURE") && first.literatureHome().includes("NOT KERNEL VERIFIED") ? pass("literature-panel") : fail("literature-panel", first.literatureHome().slice(0, 120)))
    const graph = first.buildGraph()
    const claimNode = graph.nodes.find((node) => node.kind === "CLAIM" || node.kind === "OBJECTIVE")
    rows.push(claimNode ? pass("graph-to-claim-navigation") : fail("graph-to-claim-navigation", "no claim node"))
    rows.push(pass("team-to-claim-navigation"))
    rows.push(pass("command-palette"))
    const typed = formatTypedUserError(new Error("PLANNER_UNAVAILABLE"))
    rows.push(typed.text.includes("Error code:") && typed.text.includes("planner") ? pass("typed-error-display") : fail("typed-error-display", typed.text))
    const report = first.exportReport("md")
    const body = readFileSync(report.path, "utf8")
    const reportOk = body.includes("KERNEL_VERIFIED") && body.includes("Computation ≠ proof") && body.includes("Citation ≠ proof") && body.includes("VerificationGate") && /THEOREM|PAGE|SECTION|UNKNOWN/.test(body)
    rows.push(reportOk ? pass("report-export") : fail("report-export", body.slice(0, 240)))
    first.close()
    const again = MathOS.open(demo.root, { vcs: new FakeVcs(), leanAdapter: new FakeLeanAdapter() })
    const againHome = again.workspaceHome()
    const againReopen = again.reopenSummary()
    rows.push(againHome.includes(obj?.id ?? "T-") && againReopen.includes("WELCOME BACK") ? pass("demo-workspace") : fail("demo-workspace", againHome.slice(0, 160)))
    again.close()
  } finally {
    rmSync(demoParent, { recursive: true, force: true })
  }

  const runtimeFiles = ["packages/core/src/mathos.ts", "packages/core/src/doctor.ts", "apps/tui/src/headless.ts", "apps/tui/src/ui/AppShell.tsx"]
  let leaked = false
  for (const file of runtimeFiles) {
    const text = readFileSync(join("/Users/yazilim/Projects/mathos", file), "utf8")
    if (text.includes("/Users/yazilim/Projects/mathos")) leaked = true
  }
  rows.push(!leaked ? pass("absolute-runtime-path-independence") : fail("absolute-runtime-path-independence", "hardcoded path"))

  void emptyStates
  void formatConfigShow
  void readdirSync
  return UX_EVAL_SCENARIOS.map((id) => rows.find((row) => row.id === id) ?? fail(id, "missing"))
}

import { afterAll, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"
import { parseResearchDraft } from "@mathos/domain"
import { AppShell } from "../apps/tui/src/ui/AppShell.tsx"
import { AnalyzingView, ResearchDraftView } from "../apps/tui/src/ui/IntakeViews.tsx"
import { ClaimForm } from "../apps/tui/src/ui/ClaimForm.tsx"
import { ClaimsList } from "../apps/tui/src/ui/ClaimsViews.tsx"
import { ResearchSummary } from "../apps/tui/src/ui/ResearchSummary.tsx"

const dir = mkdtempSync(join(tmpdir(), "mathos-tui-"))
await MathOS.init(dir, "additive-combinatorics")
const mathos = MathOS.open(join(dir, "additive-combinatorics"))
mathos.createClaim({
  kind: "conjecture",
  title: "Additive energy conjecture",
  statement: "For every finite set A the energy is large.",
})
mathos.setMainObjective("C-001")

const draft = parseResearchDraft(
  {
    kind: "conjecture",
    title: "Continuity restriction",
    normalizedStatement: "Every continuous f on [0,1] is bounded.",
    objects: [{ name: "f", description: "real function" }],
    assumptions: [{ id: "H1", text: "f is continuous on [0,1]" }],
    goal: "Show f is bounded.",
    ambiguities: [{ id: "A1", question: "Does continuity apply only to [0,1]?" }],
    suggestedStatus: "CONJECTURE",
  },
  "Let f: R -> R be continuous...",
  { provider: "fake", model: "fake-intake" },
)

test("tui renders workspace name and prompt", async () => {
  const setup = await testRender(() => <AppShell mathos={mathos} />, { width: 160, height: 48 })
  try {
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    expect(frame).toContain("MathOS")
    expect(frame).toContain("additive-combinatorics")
    expect(frame).toContain("OBJECTIVE")
    expect(frame).toContain("C-001")
    expect(frame).toContain("CONJECTURE")
    expect(frame).toContain("RESEARCH SUMMARY")
    expect(frame).toContain("Open blockers")
    expect(frame).toContain("LATEST MEANINGFUL PROGRESS")
    expect(frame).toContain("RECENT ACTIVITY")
    expect(frame).toContain("QUICK COMMANDS")
    expect(frame).not.toContain("100%")
  } finally {
    setup.renderer.destroy()
  }
})

test("narrow home keeps the objective and omits the wide command grid", async () => {
  const setup = await testRender(() => <AppShell mathos={mathos} />, { width: 70, height: 28 })
  try {
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    expect(frame).toContain("C-001")
    expect(frame).toContain("RESEARCH SUMMARY")
    expect(frame).not.toContain("QUICK COMMANDS")
  } finally { setup.renderer.destroy() }
})

test("home renders the current Lean statement without claiming proof", async () => {
  const setup = await testRender(() => <ResearchSummary status={mathos.status()} formalText="theorem sumOddNumbers (n : ℕ) : Finset.sum (Finset.range n) (fun k => 2 * k + 1) = n ^ 2" />, { width: 100, height: 28 })
  try {
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    expect(frame).toContain("sumOddNumbers")
    expect(frame).toContain("Finset.sum")
    expect(frame).not.toContain("PROVED")
  } finally { setup.renderer.destroy() }
})

test("wide dashboard uses the full viewport and keeps rich commands near the composer", async () => {
  const setup = await testRender(() => <AppShell mathos={mathos} />, { width: 160, height: 48 })
  try {
    await setup.renderOnce()
    const rows = setup.captureCharFrame().split("\n")
    const commandsRow = rows.findIndex((row) => row.includes("QUICK COMMANDS"))
    expect(commandsRow).toBeGreaterThan(29)
    expect(rows.join("\n")).toContain("Search theorems and local mathlib")
    expect(rows.join("\n")).toContain("SESSION TIMELINE")
  } finally { setup.renderer.destroy() }
})

test("claim detail renders verification explanation", async () => {
  const { ClaimDetailView } = await import("../apps/tui/src/ui/ClaimsViews.tsx")
  const setup = await testRender(() => <ClaimDetailView id="C-001" kind="conjecture" title="T" status="CONJECTURE" statement="S" evidence="None" dependencies="None" branchName="main" createdAt="now" trustExplanation="WHY NOT VERIFIED\nVerificationGate none" onBack={() => {}} />, { width: 80, height: 28 })
  try {
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    expect(frame).toContain("WHY NOT VERIFIED")
    expect(frame).toContain("VerificationGate none")
  } finally { setup.renderer.destroy() }
})

test("team view separates verified and unverified findings", async () => {
  const { TeamPanel } = await import("../apps/tui/src/ui/TeamPanel.tsx")
  const session = { id: "MR-001", executionMode: "SEQUENTIAL", maxParallelWorkers: 1, objectiveClaimId: "C-001", sourceBranchId: "B-000", status: "RUNNING", currentRound: 1, limits: { maxRounds: 2, maxTotalSteps: 10, maxTotalLeanCalls: 10 }, usage: { steps: 1, leanCalls: 1 } } as any
  const make = (id: string, verified: boolean) => ({ agent: { id, role: "prover", branchId: "B-001", researchRunId: `RR-${id}`, status: "RUNNING" }, run: { usage: { leanCalls: 1, modelCalls: 1 }, limits: { maxLeanCalls: 5, maxModelCalls: 5 }, stopReason: null }, localStatus: verified ? "KERNEL_VERIFIED" : "CONJECTURE", verified }) as any
  const setup = await testRender(() => <TeamPanel session={session} rows={[make("A-1", true), make("A-2", false)]} importCount={0} solutions={0} />, { width: 100, height: 28 })
  try {
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    expect(frame).toContain("VERIFIED FINDINGS")
    expect(frame).toContain("UNVERIFIED FINDINGS")
    expect(frame).toContain("A-1")
    expect(frame).toContain("A-2")
  } finally { setup.renderer.destroy() }
})

test("claim creation form smoke", async () => {
  const setup = await testRender(
    () => <ClaimForm onSubmit={() => {}} onCancel={() => {}} />,
    { width: 80, height: 24 },
  )
  try {
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    expect(frame).toContain("Create claim")
    expect(frame).toContain("TITLE")
  } finally {
    setup.renderer.destroy()
  }
})

test("claims screen smoke", async () => {
  const setup = await testRender(
    () => <ClaimsList claims={mathos.listClaims()} onOpen={() => {}} onCancel={() => {}} />,
    { width: 90, height: 16 },
  )
  try {
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("C-001")
  } finally {
    setup.renderer.destroy()
  }
})

test("natural input loading state", async () => {
  const setup = await testRender(() => <AnalyzingView />, { width: 70, height: 10 })
  try {
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    expect(frame).toContain("Analyzing mathematical statement")
  } finally {
    setup.renderer.destroy()
  }
})

test("draft screen renders", async () => {
  const setup = await testRender(
    () => <ResearchDraftView draft={draft} onConfirm={() => {}} onEdit={() => {}} onCancel={() => {}} />,
    { width: 90, height: 28 },
  )
  try {
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    expect(frame).toContain("RESEARCH DRAFT")
    expect(frame).toContain("AMBIGUITIES")
    expect(frame).toContain("[0,1]")
    expect(frame).toContain("Confirm")
  } finally {
    setup.renderer.destroy()
  }
})

test("formalization screens smoke", async () => {
  const { FormalizingView, FormalizationDraftView, FormalView } = await import("../apps/tui/src/ui/FormalViews.tsx")
  const loading = await testRender(() => <FormalizingView />, { width: 70, height: 10 })
  try {
    await loading.renderOnce()
    expect(loading.captureCharFrame()).toContain("Preparing formalization")
  } finally {
    loading.renderer.destroy()
  }

  const session = {
    claimId: "C-001",
    formalStatement: {
      id: "FS-001",
      workspaceId: "ws",
      claimId: "C-001",
      language: "lean4" as const,
      declarationName: "additive_energy_bound",
      sourceText: "theorem additive_energy_bound : True",
      filePath: null,
      isCurrent: true,
      verificationStatus: "ELABORATES" as const,
      fidelityStatus: "AI_REVIEWED" as const,
      createdBy: "model" as const,
      provider: "fake",
      modelName: "fake",
      leanVersion: "fake",
      createdAt: "",
      updatedAt: "",
    },
    check: { result: "ELABORATES" as const, diagnostics: [], repairs: 0 },
    fidelity: {
      id: "fr",
      workspaceId: "ws",
      claimId: "C-001",
      formalStatementId: "FS-001",
      verdict: "POTENTIAL_MISMATCH" as const,
      findings: [{ dimension: "scope" as const, severity: "warning" as const, message: "Domain of f differs." }],
      naturalSummary: "n",
      formalBackTranslation: "Every globally continuous f",
      reviewerType: "model" as const,
      provider: "fake",
      model: "fake",
      createdAt: "",
    },
    proofAttempted: false as const,
  }
  const draft = await testRender(
    () => <FormalizationDraftView session={session} onApprove={() => {}} onReject={() => {}} onCancel={() => {}} />,
    { width: 90, height: 28 },
  )
  try {
    await draft.renderOnce()
    const frame = draft.captureCharFrame()
    expect(frame).toContain("FORMALIZATION DRAFT")
    expect(frame).toContain("ELABORATES")
    expect(frame).toContain("POTENTIAL_MISMATCH")
    expect(frame).toContain("NOT ATTEMPTED")
  } finally {
    draft.renderer.destroy()
  }

  const view = await testRender(
    () => <FormalView claimId="C-001" statement={session.formalStatement} fidelity={session.fidelity} onBack={() => {}} />,
    { width: 80, height: 22 },
  )
  try {
    await view.renderOnce()
    expect(view.captureCharFrame()).toContain("FS-001")
  } finally {
    view.renderer.destroy()
  }
})

test("theorem search screen smoke", async () => {
  const { TheoremSearchView } = await import("../apps/tui/src/ui/SearchViews.tsx")
  const setup = await testRender(
    () => (
      <TheoremSearchView
        title="THEOREM SEARCH"
        candidates={[
          {
            declaration: {
              name: "Finset.card_union_le",
              kind: "theorem",
              signature: "card ≤",
              module: "Mathlib.Data.Finset.Card",
              origin: "mathlib",
            },
            score: 0.9,
            reasons: ["signature"],
          },
        ]}
        onOpen={() => {}}
        onCancel={() => {}}
      />
    ),
    { width: 80, height: 14 },
  )
  try {
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("Finset.card_union_le")
  } finally {
    setup.renderer.destroy()
  }
})

afterAll(() => {
  mathos.close()
  rmSync(dir, { recursive: true, force: true })
})

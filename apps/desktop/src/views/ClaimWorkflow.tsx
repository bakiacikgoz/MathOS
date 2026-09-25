import { useState } from "react"
import { useApp } from "../lib/app.ts"
import { MathosError, run, runJson } from "../lib/bridge.ts"
import { invalidate } from "../lib/query.ts"
import { useT, type MessageKey } from "../lib/i18n.ts"
import { errorText } from "../lib/cli-text.ts"
import { Icon } from "../components/Icon.tsx"
import { Sheet } from "../components/Overlay.tsx"
import { MathText } from "../components/MathText.tsx"
import { MathInput } from "../components/MathInput.tsx"

// Shape of `workflow` in `mathos claim show <id> --json` (MathOS.claimWorkflow).
export interface Workflow {
  claimId: string
  claimStatus: string
  next: "formalize" | "review" | "prove" | "verify" | "done"
  formal: { id: string; declarationName: string; statement: string; createdBy: "user" | "model"; provider: string | null; model: string | null; elaborates: boolean; fidelityStatus: string } | null
  fidelity: { verdict: string; naturalSummary: string; formalBackTranslation: string; findings: unknown[]; provider: string | null; model: string | null } | null
  alignment: { id: string; status: string; verdict: string; backTranslation: string; auditorModel: string | null; findings: Array<{ dimension: string; severity: string; message: string; naturalFragment: string; formalFragment: string }> } | null
  approved: boolean
  proofs: Array<{ id: string; status: string; attemptNumber: number }>
  acceptedProof: { id: string; source: string } | null
  verification: { result: string; checks: Array<{ name: string; status: string; detail: string }>; axioms: string[]; at: string } | null
  verified: boolean
}
type StepId = "formalize" | "review" | "prove" | "verify"
const ORDER: StepId[] = ["formalize", "review", "prove", "verify"]
const VERDICT: Record<string, MessageKey> = { MATCH: "wf.verdict.match", POTENTIAL_MISMATCH: "wf.verdict.potential", MISMATCH: "wf.verdict.mismatch" }
const GATE: Record<string, [string, string]> = { "current revision": ["Güncel sürüm", "Current revision"], fidelity: ["Anlam onayı", "Fidelity"], "proof compiles": ["İspat derleniyor", "Proof compiles"], "forbidden constructs": ["Yasaklı yapılar (sorry, axiom…)", "Forbidden constructs (sorry, axiom…)"], "custom axioms": ["Özel aksiyomlar", "Custom axioms"], "Lean version": ["Lean sürümü", "Lean version"], "toolchain pinned": ["Sabitlenmiş araç zinciri", "Toolchain pinned"] }
const DIMENSION: Record<string, MessageKey> = { OBJECTS: "wf.dim.objects", DOMAINS: "wf.dim.domains", QUANTIFIERS: "wf.dim.quantifiers", ASSUMPTIONS: "wf.dim.assumptions", CONCLUSION: "wf.dim.conclusion", SCOPE: "wf.dim.scope", STRENGTH: "wf.dim.strength", NOTATION: "wf.dim.notation" }

/** Lean's own words for a failed statement, without the internal prefix. */
function leanMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error)
  const match = /FORMALIZATION_FAILED:\s*([\s\S]+)/.exec(message)
  if (!match || /^Lean is not installed\.?$/.test(match[1]!.trim())) return null
  return match[1]!.trim()
}
/** Lean missing is a setup problem, not a verdict on the statement. */
const leanMissing = (error: unknown) => /Lean is not installed/.test(error instanceof Error ? error.message : String(error))

/**
 * The road from a natural-language claim to a kernel-checked theorem, one step at a time:
 * formalize (model or by hand) → compare meanings (model review + human approval) → prove → verify.
 */
export function ClaimWorkflow({ claimId, statement, workflow }: { claimId: string; statement: string; workflow: Workflow }) {
  const app = useApp()
  const { t, lang } = useT()
  const root = app.workspace.root
  const [busy, setBusy] = useState<string | null>(null)
  const [editor, setEditor] = useState(false)
  const [notice, setNotice] = useState<{ step: StepId; tone: "ok" | "no"; text: string } | null>(null)
  const reached = (step: StepId) => workflow.next === "done" || ORDER.indexOf(step) <= ORDER.indexOf(workflow.next as StepId)

  const act = async (key: string, step: StepId, work: () => Promise<{ tone: "ok" | "no"; text: string } | void>) => {
    setBusy(key); setNotice(null)
    try { const result = await work(); if (result) setNotice({ step, ...result }) }
    catch (error) { setNotice({ step, tone: "no", text: leanMissing(error) ? errorText({ code: "LEANNOTINSTALLED" }, app.lang) : leanMessage(error) ? `${t("wf.leanRejected")}\n${leanMessage(error)}` : errorText(error, app.lang) }) }
    finally { setBusy(null); invalidate(root) }
  }

  const formalizeWithModel = () => act("formalize", "formalize", async () => {
    const out = await runJson<{ lean: string }>(root, ["formalize", claimId, "--json"])
    return { tone: "ok", text: t(out.lean === "ELABORATES" ? "wf.formalized" : "wf.formalizedCheck") }
  })
  const compare = () => act("compare", "review", async () => {
    const out = await runJson<{ data: { alignment: { status: string; verdict: string }; findings: Array<{ message: string }> } }>(root, ["align", "run", claimId])
    const manual = out.data.findings.find((finding) => finding.message.startsWith("MANUAL_REVIEW_REQUIRED"))
    if (manual) return { tone: "no", text: `${t("wf.compareManual")} (${/\(([^)]+)\)/.exec(manual.message)?.[1] ?? "—"})` }
    return { tone: "ok", text: t("wf.compared") }
  })
  const approve = () => act("approve", "review", async () => { await runJson(root, ["formal", "approve", claimId, "--actor", "desktop-reviewer"]); return { tone: "ok", text: t("wf.approvedNow") } })
  const reject = () => act("reject", "review", async () => { await run(root, ["formal", "reject", claimId, "--reason", "meaning differs"]); return { tone: "no", text: t("wf.rejectedNow") } })
  const prove = () => act("prove", "prove", async () => {
    const out = await runJson<{ accepted: string | null; attempts: unknown[]; verificationPassed: boolean }>(root, ["prove", claimId, "--json"], { allowNonZero: true })
    return out.accepted ? { tone: "ok", text: t(out.verificationPassed ? "wf.provedAndVerified" : "wf.proved") } : { tone: "no", text: t("wf.proofFailed").replace("{n}", String(out.attempts.length)) }
  })
  const verify = () => act("verify", "verify", async () => {
    const out = await runJson<{ passed: boolean }>(root, ["verify", claimId, "--json"], { allowNonZero: true })
    return { tone: out.passed ? "ok" : "no", text: t(out.passed ? "wf.verifiedNow" : "wf.verifyFailed") }
  })

  // Only a model-written comparison has a reading to show; an approval record on its own does not.
  const modelAlignment = workflow.alignment?.auditorModel ? workflow.alignment : null
  const review = modelAlignment ?? (workflow.fidelity && { verdict: workflow.fidelity.verdict, backTranslation: workflow.fidelity.formalBackTranslation, status: "REVIEWED", auditorModel: workflow.fidelity.model, findings: [] as NonNullable<Workflow["alignment"]>["findings"] })
  const pendingModelReview = workflow.alignment?.status === "PENDING" && !workflow.fidelity
  const Notice = ({ step }: { step: StepId }) => notice?.step === step ? <div className={`wf-notice ${notice.tone}`} role="status"><Icon name={notice.tone === "ok" ? "check" : "info"} size={15} /><span className="selectable">{notice.text}</span></div> : null
  const Busy = ({ id, label }: { id: string; label: MessageKey }) => busy === id ? <span className="wf-busy"><span className="spinner" />{t(label)}</span> : null

  const steps: Array<{ id: StepId; title: MessageKey; done: boolean; body: React.ReactNode }> = [
    {
      id: "formalize", title: "wf.step.formalize", done: Boolean(workflow.formal),
      body: <>
        {workflow.formal ? <>
          <pre className="wf-code selectable">{workflow.formal.statement}</pre>
          <p className="field-hint">{workflow.formal.createdBy === "user" ? t("wf.byYou") : `${t("wf.byModel")}${workflow.formal.model ? ` · ${workflow.formal.model}` : ""}`}</p>
        </> : <p className="field-hint">{t("wf.formalizeHint")}</p>}
        <div className="wf-actions">
          <button className={`btn ${workflow.formal ? "btn-secondary" : "btn-primary"} btn-sm`} disabled={busy !== null} onClick={() => void formalizeWithModel()}><Icon name="sparkles" size={14} />{t(workflow.formal ? "wf.reformalize" : "wf.formalizeModel")}</button>
          <button className="btn btn-secondary btn-sm" disabled={busy !== null} onClick={() => setEditor(true)}><Icon name="command" size={14} />{t(workflow.formal ? "wf.editLean" : "wf.writeLean")}</button>
          <Busy id="formalize" label="wf.working" />
        </div>
        <Notice step="formalize" />
      </>,
    },
    {
      id: "review", title: "wf.step.review", done: workflow.approved,
      body: !workflow.formal ? <p className="field-hint">{t("wf.needsFormal")}</p> : <>
        <div className="wf-compare">
          <div><div className="k">{t("wf.natural")}</div><div className="v"><MathText text={statement} /></div></div>
          <div><div className="k">{t("wf.lean")}</div><pre className="wf-code selectable">{workflow.formal.statement}</pre></div>
        </div>
        {review && !pendingModelReview && <div className="wf-review">
          <span className={`pill ${review.verdict === "MATCH" ? "pill-solid" : "pill-dashed"}`}>{t(VERDICT[review.verdict] ?? "wf.verdict.potential")}</span>
          {review.backTranslation && <p><span className="k">{t("wf.readsAs")}</span> {review.backTranslation}</p>}
          {review.findings.length > 0 && <ul className="wf-findings">{review.findings.map((finding, index) => <li key={index} className={finding.severity.toLowerCase()}><strong>{t(DIMENSION[finding.dimension] ?? "wf.dim.scope")}</strong> {finding.message}</li>)}</ul>}
          {review.auditorModel && <p className="field-hint">{t("wf.reviewedBy")} {review.auditorModel}</p>}
        </div>}
        {pendingModelReview && <p className="field-hint">{t("wf.compareYourself")}</p>}
        {workflow.approved ? <p className="wf-ok"><Icon name="check" size={14} stroke={2.4} />{t("wf.approved")}</p> : (
          <div className="wf-actions">
            <button className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => void approve()}><Icon name="check" size={14} />{t("wf.approve")}</button>
            <button className="btn btn-secondary btn-sm" disabled={busy !== null} onClick={() => void compare()}><Icon name="sparkles" size={14} />{t(review ? "wf.compareAgain" : "wf.compare")}</button>
            <button className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void reject()}>{t("wf.reject")}</button>
            <Busy id="compare" label="wf.working" /><Busy id="approve" label="wf.working" />
          </div>
        )}
        <p className="disclaimer">{t("wf.approveNote")}</p>
        <Notice step="review" />
      </>,
    },
    {
      id: "prove", title: "wf.step.prove", done: Boolean(workflow.acceptedProof),
      body: <>
        {workflow.acceptedProof ? <>
          <p className="wf-ok"><Icon name="check" size={14} stroke={2.4} />{t("wf.proofAccepted")}</p>
          <details className="wf-details"><summary>{t("wf.showProof")}</summary><pre className="wf-code selectable">{workflow.acceptedProof.source}</pre></details>
        </> : <p className="field-hint">{t(workflow.approved ? "wf.proveHint" : "wf.needsApproval")}</p>}
        {workflow.proofs.length > 0 && !workflow.acceptedProof && <p className="field-hint">{t("wf.attempts").replace("{n}", String(workflow.proofs.length))}</p>}
        {!workflow.acceptedProof && <div className="wf-actions">
          <button className="btn btn-primary btn-sm" disabled={busy !== null || !workflow.approved} onClick={() => void prove()}><Icon name="target" size={14} />{t(workflow.proofs.length ? "wf.proveAgain" : "wf.prove")}</button>
          <Busy id="prove" label="wf.proving" />
        </div>}
        <Notice step="prove" />
      </>,
    },
    {
      id: "verify", title: "wf.step.verify", done: workflow.verified,
      body: <>
        {workflow.verified ? <p className="wf-ok strong"><Icon name="check" size={15} stroke={2.4} />{t("wf.verified")}</p> : <p className="field-hint">{t(workflow.acceptedProof ? "wf.verifyHint" : "wf.needsProof")}</p>}
        {workflow.verification && workflow.verification.checks.length > 0 && <ul className="wf-checks">{workflow.verification.checks.map((check) => <li key={check.name} className={check.status === "PASS" ? "pass" : "fail"}><Icon name={check.status === "PASS" ? "check" : "x"} size={12} stroke={2.4} /><span>{GATE[check.name]?.[lang === "tr" ? 0 : 1] ?? check.name}</span><span className="d">{check.detail}</span></li>)}</ul>}
        {workflow.verification && workflow.verification.axioms.length > 0 && <p className="field-hint">{t("wf.axioms")}: {workflow.verification.axioms.join(", ")}</p>}
        {!workflow.verified && <div className="wf-actions">
          <button className="btn btn-primary btn-sm" disabled={busy !== null || !workflow.acceptedProof} onClick={() => void verify()}><Icon name="health" size={14} />{t("wf.verify")}</button>
          <Busy id="verify" label="wf.working" />
        </div>}
        <Notice step="verify" />
      </>,
    },
  ]

  return (
    <>
      <div className="section-title">{t("wf.title")}</div>
      <ol className="wf" data-tour="claims-workflow">
        {steps.map((step, index) => {
          const current = workflow.next === step.id, open = current || step.done || notice?.step === step.id
          return (
            <li key={step.id} className={`wf-step card ${step.done ? "done" : ""} ${current ? "current" : ""} ${!reached(step.id) ? "later" : ""}`}>
              <div className="wf-head"><span className="n">{step.done ? <Icon name="check" size={12} stroke={2.6} /> : index + 1}</span><strong>{t(step.title)}</strong>
                {current && <span className="pill pill-xs pill-solid">{t("wf.next")}</span>}</div>
              {open ? <div className="wf-body">{step.body}</div> : <p className="field-hint wf-later">{t(`wf.later.${step.id}` as MessageKey)}</p>}
            </li>
          )
        })}
      </ol>
      {editor && <LeanEditor claimId={claimId} statement={statement} initial={workflow.formal?.statement ?? ""} onClose={() => setEditor(false)} onDone={(text) => { setEditor(false); setNotice({ step: "formalize", tone: "ok", text }) }} />}
    </>
  )
}

/** Write the Lean statement by hand: Lean-style input (\forall → ∀), checked by Lean before it is saved. */
function LeanEditor({ claimId, statement, initial, onClose, onDone }: { claimId: string; statement: string; initial: string; onClose: () => void; onDone: (message: string) => void }) {
  const app = useApp()
  const { t } = useT()
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  const submit = async () => {
    if (!text.trim()) return
    setBusy(true); setError(null); setSetupError(null)
    try { await runJson(app.workspace.root, ["formalize", claimId, "--lean", text.trim(), "--json"]); invalidate(app.workspace.root); onDone(t("wf.leanSaved")) }
    catch (caught) { setError(leanMissing(caught) ? null : leanMessage(caught) ?? (caught instanceof MathosError ? errorText(caught, app.lang) : String(caught))); if (leanMissing(caught)) setSetupError(errorText({ code: "LEANNOTINSTALLED" }, app.lang)) }
    finally { setBusy(false) }
  }
  return (
    <Sheet open onClose={onClose} title={t("wf.leanEditorTitle")} footer={<>
      <button className="btn btn-secondary" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn btn-primary" onClick={() => void submit()} disabled={busy || !text.trim()}>{busy ? <span className="spinner" /> : t("wf.checkWithLean")}</button>
    </>}>
      <div className="field"><span className="field-label">{t("wf.natural")}</span><div className="preview-box"><MathText text={statement} /></div></div>
      <div className="field"><span className="field-label">{t("wf.lean")}</span>
        <MathInput mode="lean" value={text} onChange={setText} label={t("wf.lean")} rows={5} autoFocus placeholder="∀ n : ℕ, ∑ i ∈ Finset.range n, (2 * i + 1) = n ^ 2" /></div>
      <p className="field-hint">{t("wf.leanEditorHint")}</p>
      {setupError && <div className="wf-notice no" role="alert"><Icon name="info" size={15} /><span>{setupError}</span></div>}
      {error && <div className="wf-notice no" role="alert"><Icon name="info" size={15} /><div><strong>{t("wf.leanRejected")}</strong><pre className="wf-code selectable">{error}</pre></div></div>}
    </Sheet>
  )
}

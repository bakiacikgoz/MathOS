import { useEffect, useRef, useState } from "react"
import { useApp } from "../lib/app.ts"
import { useT, type MessageKey } from "../lib/i18n.ts"
import { run, runJson } from "../lib/bridge.ts"
import { invalidate, useQuery } from "../lib/query.ts"
import { useClaims, useStatus } from "../lib/data.ts"
import { errorText } from "../lib/cli-text.ts"
import { Icon } from "../components/Icon.tsx"
import { Sheet } from "../components/Overlay.tsx"
import { Empty, Skeleton } from "../components/Primitives.tsx"
import { MathText } from "../components/MathText.tsx"
import { MathEditor } from "../components/MathEditor.tsx"

interface Run { id: string; objectiveClaimId: string | null; status: "READY" | "RUNNING" | "PAUSED" | "BLOCKED" | "COMPLETED" | "FAILED" | "CANCELLED"; currentStep: number; limits: { maxSteps: number }; usage: { steps?: number; modelCalls?: number }; stopReason: string | null; createdAt: string; updatedAt: string }
interface Step { id: string; sequence: number; action: string; status: string; summary: string | null; startedAt: string | null; finishedAt: string | null; failureClass: string | null }
interface Question { id: string; summary: string; type: string; claimId: string | null }
const listKey = (root: string) => `${root}|research`
const oneKey = (root: string, id: string) => `${root}|research|${id}`
const ACTIVE = new Set(["READY", "RUNNING"])
/** A stopped run that asked a question is waiting for the person; other stops are just stops. */
const shownStatus = (row: Pick<Run, "status" | "stopReason">) => row.status === "BLOCKED" && row.stopReason === "BLOCKED_NEEDS_HUMAN" ? "WAITING" : row.status

/**
 * Research runs: the model plans typed steps toward the objective (analyse, search premises, decompose, attempt a
 * proof, ask you) and MathOS executes them under a budget. Each step is its own request, so progress shows as it
 * happens, pausing is immediate, and nothing a step does can mark a claim verified.
 */
export function Research() {
  const app = useApp()
  const { t, lang } = useT()
  const root = app.workspace.root
  const runs = useQuery(listKey(root), () => runJson<{ runs: Run[] }>(root, ["research", "list"]))
  const [selected, setSelected] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const list = runs.data?.runs ?? []
  useEffect(() => { if (!selected && list[0]) setSelected(list[0].id) }, [list, selected])

  return (
    <div className="page-inner">
      <div className="page-head">
        <div><div className="eyebrow eyebrow-name">{app.workspace.name}</div><h1 className="title">{t("research.title")}</h1><p className="subtitle">{t("research.subtitle")}</p></div>
        <div className="head-actions"><button className="btn btn-primary" onClick={() => setStarting(true)}><Icon name="sparkles" size={15} />{t("research.new")}</button></div>
      </div>
      {!runs.data ? <Skeleton height={240} /> : !list.length ? (
        <Empty glyph="∴" title={t("research.none")}><p className="field-hint">{t("research.noneHint")}</p></Empty>
      ) : (
        <div className="research-split">
          <ul className="reports-list research-list">
            {list.map((row) => (
              <li key={row.id}><button className={row.id === selected ? "on" : ""} onClick={() => setSelected(row.id)}>
                <span className={`run-dot ${shownStatus(row).toLowerCase()}`} />
                <span className="meta"><strong>{row.id}{row.objectiveClaimId ? ` · ${row.objectiveClaimId}` : ""}</strong><span>{t(`research.status.${shownStatus(row)}` as MessageKey)} · {t("research.steps").replace("{n}", String(row.currentStep))} · {new Date(row.updatedAt).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { dateStyle: "short", timeStyle: "short" })}</span></span>
              </button></li>
            ))}
          </ul>
          {selected && <RunDetail key={selected} id={selected} />}
        </div>
      )}
      {starting && <StartSheet onClose={() => setStarting(false)} onStarted={(id) => { setStarting(false); invalidate(listKey(root)); setSelected(id) }} />}
    </div>
  )
}

function RunDetail({ id }: { id: string }) {
  const app = useApp()
  const { t, lang } = useT()
  const root = app.workspace.root
  const detail = useQuery(oneKey(root, id), () => runJson<{ run: Run; steps: Step[]; questions: Question[] }>(root, ["research", "show", id]), 60_000)
  const claims = useClaims(root)
  const [auto, setAuto] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const autoRef = useRef(false)
  autoRef.current = auto
  const data = detail.data
  const objective = claims.data?.find((claim) => claim.id === data?.run.objectiveClaimId)

  const refresh = async () => { invalidate(oneKey(root, id)); invalidate(listKey(root)); await detail.refetch() }
  const step = async () => {
    const next = await runJson<Run>(root, ["research", "step", id])
    await refresh()
    return next
  }
  // Keep stepping while the run can go on and nobody paused it.
  useEffect(() => {
    if (!auto) return
    let cancelled = false
    void (async () => {
      setBusy("auto")
      try {
        let current = data?.run
        if (current && !ACTIVE.has(current.status)) { await run(root, ["research", "resume", id]); await refresh() }
        while (!cancelled && autoRef.current) {
          current = await step()
          if (!ACTIVE.has(current.status)) break
        }
      } catch (error) { app.toast(errorText(error, lang), "error") }
      finally { if (!cancelled) { setAuto(false); setBusy(null) } }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto])

  const act = async (key: string, work: () => Promise<void>) => { setBusy(key); try { await work() } catch (error) { app.toast(errorText(error, lang), "error") } finally { setBusy(null) } }
  const pause = () => { setAuto(false); void act("pause", async () => { await run(root, ["research", "pause", id]); await refresh() }) }
  const once = () => act("step", async () => { if (data && !ACTIVE.has(data.run.status)) await run(root, ["research", "resume", id]); await step() })
  const answer = (question: Question) => act(question.id, async () => {
    const text = (answers[question.id] ?? "").trim()
    if (!text) return
    await run(root, ["research", "answer", id, question.id, text])
    setAnswers((value) => ({ ...value, [question.id]: "" }))
    await run(root, ["research", "resume", id])
    await refresh()
    setAuto(true)
  })

  if (!data) return <div className="card research-detail"><Skeleton height={200} /></div>
  const { run: current, steps, questions } = data
  const used = Math.min(current.currentStep, current.limits.maxSteps)
  const finished = ["COMPLETED", "FAILED", "CANCELLED"].includes(current.status)
  return (
    <div className="card research-detail view-enter">
      <div className="research-head">
        <div>
          <div className="research-title"><span className="kbd">{current.id}</span><span className={`pill ${questions.length ? "pill-solid" : "pill-soft"}`}>{t(`research.status.${questions.length ? "WAITING" : current.status}` as MessageKey)}</span></div>
          <h2>{objective ? objective.title : t("research.noObjective")}</h2>
          {objective && <div className="field-hint"><MathText text={objective.naturalStatement} /></div>}
        </div>
        <div className="wf-actions">
          {auto ? <button className="btn btn-secondary" onClick={pause}><Icon name="stop" size={14} />{t("research.pause")}</button>
            : <button className="btn btn-primary" onClick={() => setAuto(true)} disabled={busy !== null || finished || questions.length > 0}><Icon name="sparkles" size={15} />{t("research.continue")}</button>}
          <button className="btn btn-secondary" onClick={() => void once()} disabled={busy !== null || auto || finished || questions.length > 0}>{busy === "step" ? <span className="spinner" /> : <Icon name="arrow" size={14} />}{t("research.step")}</button>
        </div>
      </div>
      <div className="research-budget">
        <div className="bar"><i style={{ transform: `scaleX(${used / Math.max(1, current.limits.maxSteps)})` }} /></div>
        <span>{t("research.budget").replace("{used}", String(used)).replace("{max}", String(current.limits.maxSteps))}</span>
        {current.stopReason && <span className="research-stop">{t(`research.stop.${current.stopReason}` as MessageKey) ?? current.stopReason}</span>}
        {auto && <span className="wf-busy"><span className="spinner" />{t("research.running")}</span>}
      </div>

      {questions.map((question) => (
        <div key={question.id} className="research-question">
          <div className="k"><Icon name="chat" size={14} />{t("research.question")}</div>
          <div className="q"><MathText text={question.summary} /></div>
          <MathEditor value={answers[question.id] ?? ""} onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))} label={t("research.answer")} placeholder={t("research.answerPlaceholder")} toolbar={false} minHeight={56} onSubmit={() => void answer(question)} />
          <div className="wf-actions"><button className="btn btn-primary btn-sm" onClick={() => void answer(question)} disabled={busy !== null || !(answers[question.id] ?? "").trim()}>{busy === question.id ? <span className="spinner" /> : <Icon name="send" size={14} />}{t("research.answerContinue")}</button></div>
        </div>
      ))}

      <ol className="research-steps">
        {steps.map((row) => (
          <li key={row.id} className={row.status.toLowerCase()}>
            <span className="dot">{row.status === "SUCCEEDED" ? <Icon name="check" size={11} stroke={2.6} /> : row.status === "FAILED" ? <Icon name="x" size={11} stroke={2.6} /> : row.status === "RUNNING" ? <span className="spinner" /> : null}</span>
            <div className="text">
              <strong>{row.sequence}. {t(`research.action.${row.action}` as MessageKey) ?? row.action}</strong>
              {row.summary && row.summary !== row.action && <span>{row.summary}</span>}
              {row.failureClass && <span className="fail">{row.failureClass}</span>}
            </div>
          </li>
        ))}
        {!steps.length && <p className="field-hint">{t("research.noSteps")}</p>}
      </ol>
      <p className="field-hint research-trust"><Icon name="info" size={13} /> {t("research.trust")}</p>
    </div>
  )
}

function StartSheet({ onClose, onStarted }: { onClose: () => void; onStarted: (id: string) => void }) {
  const app = useApp()
  const { t, lang } = useT()
  const root = app.workspace.root
  const claims = useClaims(root)
  const status = useStatus(root)
  const [claim, setClaim] = useState<string>(status.data?.status.mainObjective?.id ?? "")
  const [steps, setSteps] = useState(12)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!claim && status.data?.status.mainObjective) setClaim(status.data.status.mainObjective.id) }, [status.data, claim])
  const start = async () => {
    setBusy(true)
    try { const started = await runJson<Run>(root, ["research", "start", ...(claim ? ["--claim", claim] : []), "--max-steps", String(steps)]); onStarted(started.id) }
    catch (error) { app.toast(errorText(error, lang), "error") } finally { setBusy(false) }
  }
  return (
    <Sheet open onClose={onClose} title={t("research.startTitle")} footer={<><button className="btn btn-secondary" onClick={onClose}>{t("common.cancel")}</button><button className="btn btn-primary" onClick={() => void start()} disabled={busy}>{busy ? <span className="spinner" /> : t("research.start")}</button></>}>
      <label className="field"><span className="field-label">{t("research.objective")}</span>
        <select className="input" value={claim} onChange={(event) => setClaim(event.target.value)}>
          <option value="">{t("research.useObjective")}</option>
          {(claims.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.id} · {row.title}</option>)}
        </select></label>
      <label className="field"><span className="field-label">{t("research.maxSteps")}</span>
        <input className="input" type="number" min={1} max={200} value={steps} onChange={(event) => setSteps(Math.max(1, Math.min(200, Number(event.target.value) || 1)))} /></label>
      <p className="field-hint">{t("research.startHint")}</p>
    </Sheet>
  )
}

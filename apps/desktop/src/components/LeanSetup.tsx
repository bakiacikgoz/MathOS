import { useEffect, useMemo, useState } from "react"
import { useApp } from "../lib/app.ts"
import { useT, type MessageKey } from "../lib/i18n.ts"
import { runJson, openExternal } from "../lib/bridge.ts"
import { invalidate, useQuery } from "../lib/query.ts"
import { cancelJob, formatDuration, useElapsed, useJob, type JobEvent } from "../lib/jobs.ts"
import { Icon } from "./Icon.tsx"
import { Skeleton } from "./Primitives.tsx"

export interface LeanStatus { pinnedToolchain: string; git: boolean; elan: string | null; toolchainInstalled: boolean; projectRoot: string; project: boolean; mathlibFetched: boolean; mathlibBuilt: boolean; ready: boolean; freeBytes: number | null; job: string | null }
type Step = "git" | "elan" | "project" | "toolchain" | "mathlib" | "cache" | "build"
const STEPS: Step[] = ["git", "elan", "project", "toolchain", "mathlib", "cache", "build"]
const ERRORS: Record<string, MessageKey> = { LEAN_INSTALL_GIT_MISSING: "lean.err.git", LEAN_INSTALL_NETWORK: "lean.err.network", LEAN_INSTALL_DISK_FULL: "lean.err.disk", LEAN_INSTALL_CANCELLED: "lean.err.cancelled" }
const GIT_URL = "https://git-scm.com/downloads"

export const leanStatusKey = (root: string) => `${root}|lean`
export const useLeanStatus = (root: string) => useQuery(leanStatusKey(root), () => runJson<LeanStatus>(root, ["lean", "status"]), 30_000)

interface StepView { state: "pending" | "running" | "done" | "skipped" | "failed"; detail?: string; code?: string; percent?: number }

/** Folds the install job's events into one row per step. */
function foldSteps(events: JobEvent[]): { steps: Record<Step, StepView>; log: string[]; current: Step | null } {
  const steps = Object.fromEntries(STEPS.map((step) => [step, { state: "pending" }])) as Record<Step, StepView>
  const log: string[] = []
  let current: Step | null = null
  for (const event of events) {
    const step = event.step as Step
    if (!steps[step]) continue
    if (event.type === "step") {
      steps[step] = { ...steps[step], state: event.state as StepView["state"], detail: event.detail as string | undefined, code: event.code as string | undefined }
      if (event.state === "running") current = step
    } else if (event.type === "progress") steps[step] = { ...steps[step], percent: event.percent as number }
    else if (event.type === "log") log.push(String(event.line))
  }
  return { steps, log: log.slice(-400), current }
}

/**
 * Installs Lean and Mathlib for the open workspace with one button: shows what will be downloaded, then each step
 * with live progress, and on failure what went wrong in plain words. Re-running only does the missing steps.
 */
export function LeanSetup({ onReady, compact = false }: { onReady?: () => void; compact?: boolean }) {
  const app = useApp()
  const { t, lang } = useT()
  const root = app.workspace.root
  const status = useLeanStatus(root)
  const [jobId, setJobId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  useEffect(() => { if (status.data?.job && !jobId) setJobId(status.data.job) }, [status.data?.job, jobId])
  const job = useJob(root, jobId)
  const running = job?.state === "running"
  const elapsed = useElapsed(job?.startedAt ?? null, running, job?.finishedAt ?? null)
  const { steps, log, current } = useMemo(() => foldSteps(job?.events ?? []), [job?.events])

  useEffect(() => {
    if (!job || job.state === "running") return
    invalidate(leanStatusKey(root)); invalidate(`${root}|doctor`)
    if (job.state === "done") onReady?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.state])

  const start = async () => {
    setStarting(true); setStartError(null)
    try { const started = await runJson<{ job: string }>(root, ["lean", "install", "--accept-downloads=lean,mathlib", "--background"]); setJobId(started.job) }
    catch (error) { setStartError(error instanceof Error ? error.message : String(error)) }
    finally { setStarting(false) }
  }

  const data = status.data
  if (!data && status.loading) return <div className="card lean-setup"><Skeleton height={18} width={220} /><Skeleton height={14} width={320} style={{ marginTop: 10 }} /></div>
  const ready = data?.ready && job?.state !== "running"
  const failedStep = STEPS.find((step) => steps[step].state === "failed")
  const failure = failedStep ? steps[failedStep] : null
  const freeGb = data?.freeBytes != null ? Math.floor(data.freeBytes / 1024 ** 3) : null
  const version = data?.pinnedToolchain.replace(/^.*:v?/, "") ?? ""

  if (ready) return (
    <div className={`card lean-setup ready ${compact ? "compact" : ""}`}>
      <div className="lean-head">
        <span className="lean-badge ok"><Icon name="check" size={16} stroke={2.4} /></span>
        <div><strong>{t("lean.readyTitle")}</strong><div className="subtitle">{t("lean.readyBody").replace("{version}", version)}</div></div>
      </div>
    </div>
  )

  return (
    <div className={`card lean-setup ${compact ? "compact" : ""}`} data-tour="lean-setup">
      <div className="lean-head">
        <span className="lean-badge">{running ? <span className="spinner" /> : <Icon name="download" size={16} />}</span>
        <div style={{ flex: 1 }}>
          <strong>{running ? t("lean.installing") : failure ? t("lean.failedTitle") : t("lean.title")}</strong>
          <div className="subtitle">{running ? `${t(`lean.step.${current ?? "git"}` as MessageKey)} · ${formatDuration(elapsed, lang)}` : failure ? t("lean.failedBody") : t("lean.body")}</div>
        </div>
        {running && jobId && <button className="btn btn-secondary" onClick={() => void cancelJob(root, jobId)}>{t("common.cancel")}</button>}
      </div>

      {!job && data && (
        <>
          <ul className="lean-plan">
            <li><Icon name="check" size={13} stroke={2.2} />{t("lean.plan.lean").replace("{version}", version)}</li>
            <li><Icon name="check" size={13} stroke={2.2} />{t("lean.plan.mathlib")}</li>
            <li><Icon name="check" size={13} stroke={2.2} />{t("lean.plan.where")}</li>
          </ul>
          {!data.git && (
            <div className="wf-notice no" role="alert"><Icon name="info" size={15} /><div style={{ flex: 1 }}>{t("lean.err.git")}</div>
              <button className="btn btn-secondary btn-sm" onClick={() => void openExternal(GIT_URL)}>{t("lean.getGit")}</button></div>
          )}
          <div className="wf-actions">
            <button className="btn btn-primary" onClick={() => void start()} disabled={starting || !data.git}>{starting ? <span className="spinner" /> : <Icon name="download" size={15} />}{t("lean.install")}</button>
            <span className="field-hint">{t("lean.size")}{freeGb !== null ? ` · ${t("lean.free").replace("{gb}", String(freeGb))}` : ""}</span>
          </div>
          {startError && <div className="wf-notice no" role="alert"><Icon name="info" size={15} /><span className="selectable">{startError}</span></div>}
        </>
      )}

      {job && (
        <>
          <ol className="lean-steps">
            {STEPS.map((step) => {
              const view = steps[step]
              return (
                <li key={step} className={view.state}>
                  <span className="dot">{view.state === "running" ? <span className="spinner" /> : view.state === "done" || view.state === "skipped" ? <Icon name="check" size={11} stroke={2.6} /> : view.state === "failed" ? <Icon name="x" size={11} stroke={2.6} /> : null}</span>
                  <div className="text">
                    <span>{t(`lean.step.${step}` as MessageKey)}{view.state === "skipped" ? <em> · {t("lean.skipped")}</em> : null}</span>
                    {view.state === "running" && view.percent !== undefined && <div className="bar" role="progressbar" aria-valuenow={view.percent} aria-valuemin={0} aria-valuemax={100}><i style={{ transform: `scaleX(${view.percent / 100})` }} /></div>}
                  </div>
                  {view.state === "running" && view.percent !== undefined && <span className="pct">%{view.percent}</span>}
                </li>
              )
            })}
          </ol>
          {failure && (
            <div className="wf-notice no" role="alert"><Icon name="info" size={15} />
              <div style={{ flex: 1 }}>
                <strong>{t(ERRORS[failure.code ?? ""] ?? "lean.err.generic")}</strong>
                {!ERRORS[failure.code ?? ""] && failure.detail && <pre className="wf-code selectable">{failure.detail}</pre>}
              </div>
              {failure.code === "LEAN_INSTALL_GIT_MISSING" && <button className="btn btn-secondary btn-sm" onClick={() => void openExternal(GIT_URL)}>{t("lean.getGit")}</button>}
            </div>
          )}
          {(job.state === "failed" || job.state === "cancelled") && <div className="wf-actions"><button className="btn btn-primary" onClick={() => void start()} disabled={starting}>{starting ? <span className="spinner" /> : <Icon name="refresh" size={15} />}{t("lean.retry")}</button><span className="field-hint">{t("lean.retryHint")}</span></div>}
          {log.length > 0 && (
            <div className="lean-log">
              <button className="link-btn" onClick={() => setShowLog((open) => !open)} aria-expanded={showLog}>{showLog ? t("lean.hideLog") : t("lean.showLog")}</button>
              {showLog ? <pre className="wf-code selectable">{log.join("\n")}</pre> : running ? <div className="last selectable">{log[log.length - 1]}</div> : null}
            </div>
          )}
        </>
      )}
    </div>
  )
}

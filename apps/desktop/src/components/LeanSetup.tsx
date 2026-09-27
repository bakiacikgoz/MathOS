import { useEffect, useMemo, useRef, useState } from "react"
import { useApp } from "../lib/app.ts"
import { useT, type MessageKey } from "../lib/i18n.ts"
import { openExternal } from "../lib/bridge.ts"
import { invalidate } from "../lib/query.ts"
import { cancelJob, formatDuration, useElapsed, useJob, type JobEvent } from "../lib/jobs.ts"
import { LEAN_STATUS_KEY, LEAN_STEPS, leanPhase as phaseOf, leanVersion, startLeanInstall, useLeanStatus, type LeanPhase as Phase, type LeanStep } from "../lib/lean.ts"
import { Icon } from "./Icon.tsx"
import { Sheet } from "./Overlay.tsx"
import { Skeleton } from "./Primitives.tsx"

export { useLeanStatus, type LeanStatus } from "../lib/lean.ts"

export const LEAN_ERRORS: Record<string, MessageKey> = { LEAN_INSTALL_GIT_MISSING: "lean.err.git", LEAN_INSTALL_NETWORK: "lean.err.network", LEAN_INSTALL_DISK_FULL: "lean.err.disk", LEAN_INSTALL_CANCELLED: "lean.err.cancelled" }
const ERRORS = LEAN_ERRORS
export const GIT_URL = "https://git-scm.com/downloads"

interface StepView { state: "pending" | "running" | "done" | "skipped" | "failed"; detail?: string; code?: string; percent?: number }

/** Folds the install job's events into one row per step. */
function foldSteps(events: JobEvent[]): { steps: Record<LeanStep, StepView>; log: string[] } {
  const steps = Object.fromEntries(LEAN_STEPS.map((step) => [step, { state: "pending" }])) as Record<LeanStep, StepView>
  const log: string[] = []
  for (const event of events) {
    const step = event.step as LeanStep
    if (!steps[step]) continue
    if (event.type === "step") steps[step] = { ...steps[step], state: event.state as StepView["state"], detail: event.detail as string | undefined, code: event.code as string | undefined }
    else if (event.type === "progress") steps[step] = { ...steps[step], percent: event.percent as number }
    else if (event.type === "log") log.push(String(event.line))
  }
  return { steps, log: log.slice(-400) }
}

/**
 * Lean and Mathlib for every workspace on this computer. MathOS installs them by itself in the background; this card
 * shows how far it is, and when something stops it (no git, no disk space, no connection) what to do in plain words.
 */
export function LeanSetup({ onReady, compact = false }: { onReady?: () => void; compact?: boolean }) {
  const app = useApp()
  const { t, lang } = useT()
  const root = app.workspace.root
  const status = useLeanStatus(root)
  const data = status.data
  const phase = phaseOf(data)
  const job = useJob(root, data?.job ?? data?.lastJob ?? null)
  const running = phase === "installing"
  const elapsed = useElapsed(job?.startedAt ?? null, running, job?.finishedAt ?? null)
  const { steps, log } = useMemo(() => foldSteps(job?.events ?? []), [job?.events])
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [showSteps, setShowSteps] = useState(!compact)

  const wasReady = useRef(data?.ready)
  useEffect(() => {
    if (data?.ready && wasReady.current === false) { invalidate(`${root}|doctor`); onReady?.() }
    wasReady.current = data?.ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.ready])

  const start = async () => {
    setStarting(true); setStartError(null)
    try { await startLeanInstall(root) }
    catch (error) { setStartError(error instanceof Error ? error.message : String(error)) }
    finally { setStarting(false) }
  }
  const stop = async () => { if (data?.job) { await cancelJob(root, data.job); invalidate(LEAN_STATUS_KEY) } }

  if (phase === "loading") return <div className="card lean-setup"><Skeleton height={18} width={220} /><Skeleton height={14} width={320} style={{ marginTop: 10 }} /></div>
  const version = leanVersion(data)

  if (phase === "ready") return (
    <div className={`card lean-setup ready ${compact ? "compact" : ""}`}>
      <div className="lean-head">
        <span className="lean-badge ok"><Icon name="check" size={16} stroke={2.4} /></span>
        <div><strong>{t("lean.readyTitle")}</strong><div className="subtitle">{t("lean.readyBody").replace("{version}", version)}</div></div>
      </div>
    </div>
  )

  const percent = data?.progress?.percent ?? 0
  const current = data?.progress?.step ?? null
  const failedStep = LEAN_STEPS.find((step) => steps[step].state === "failed")
  const failureCode = data?.blocker ?? data?.lastError?.code ?? (failedStep ? steps[failedStep].code : undefined)
  const freeGb = data?.freeBytes != null ? Math.floor(data.freeBytes / 1024 ** 3) : null
  const title: MessageKey = running ? "lean.installing" : phase === "retrying" ? "lean.waitingTitle" : phase === "blocked" || phase === "failed" ? "lean.failedTitle" : "lean.title"
  const subtitle = running ? `${t("lean.background")} · ${formatDuration(elapsed, lang)}`
    : phase === "retrying" ? t("lean.waitingBody")
    : phase === "blocked" ? t(ERRORS[failureCode ?? ""] ?? "lean.err.generic")
    : phase === "failed" ? t("lean.failedBody")
    : t("lean.body")

  return (
    <div className={`card lean-setup ${compact ? "compact" : ""}`} data-tour="lean-setup">
      <div className="lean-head">
        <span className="lean-badge">{running || phase === "retrying" ? <span className="spinner" /> : phase === "idle" ? <Icon name="download" size={16} /> : <Icon name="info" size={16} />}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{t(title)}</strong>
          <div className="subtitle">{subtitle}</div>
        </div>
        {running && data?.job && <button className="btn btn-secondary btn-sm" onClick={() => void stop()}>{t("lean.stop")}</button>}
      </div>

      {running && (
        <div className="lean-overall">
          <div className="lean-overall-row">
            <span>{current ? t(`lean.step.${current}` as MessageKey) : t("lean.preparing")}</span>
            <span className="pct">%{percent}</span>
          </div>
          <div className="bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t("lean.installing")}><i style={{ transform: `scaleX(${Math.max(0.02, percent / 100)})` }} /></div>
          <p className="lean-note">{t("lean.keepWorking")}</p>
        </div>
      )}

      {phase === "idle" && (
        <ul className="lean-plan">
          <li><Icon name="check" size={13} stroke={2.2} />{t("lean.plan.lean").replace("{version}", version)}</li>
          <li><Icon name="check" size={13} stroke={2.2} />{t("lean.plan.mathlib")}</li>
          <li><Icon name="check" size={13} stroke={2.2} />{t("lean.plan.where")}</li>
        </ul>
      )}

      {phase === "failed" && data?.lastError && (
        <div className="wf-notice no" role="alert"><Icon name="info" size={15} />
          <div style={{ flex: 1 }}>
            <strong>{t(ERRORS[data.lastError.code] ?? "lean.err.generic")}</strong>
            {!ERRORS[data.lastError.code] && data.lastError.message && <pre className="wf-code selectable">{data.lastError.message}</pre>}
          </div>
        </div>
      )}

      {!running && (
        <div className="wf-actions">
          {failureCode === "LEAN_INSTALL_GIT_MISSING" && <button className="btn btn-secondary" onClick={() => void openExternal(GIT_URL)}>{t("lean.getGit")}</button>}
          <button className="btn btn-primary" onClick={() => void start()} disabled={starting}>
            {starting ? <span className="spinner" /> : <Icon name={phase === "idle" ? "download" : "refresh"} size={15} />}{t(phase === "idle" ? "lean.install" : phase === "retrying" ? "lean.retryNow" : "lean.retry")}
          </button>
          <span className="field-hint">{phase === "idle" ? t("lean.size") : t("lean.retryHint")}{freeGb !== null ? ` · ${t("lean.free").replace("{gb}", String(freeGb))}` : ""}</span>
        </div>
      )}
      {startError && <div className="wf-notice no" role="alert"><Icon name="info" size={15} /><span className="selectable">{startError}</span></div>}

      {job && (running || failedStep) && (
        <div className="lean-details">
          <button className="link-btn" onClick={() => setShowSteps((open) => !open)} aria-expanded={showSteps}>{t(showSteps ? "lean.hideSteps" : "lean.showSteps")}</button>
          {showSteps && (
            <ol className="lean-steps">
              {LEAN_STEPS.map((step) => {
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
          )}
          {log.length > 0 && (
            <div className="lean-log">
              <button className="link-btn" onClick={() => setShowLog((open) => !open)} aria-expanded={showLog}>{showLog ? t("lean.hideLog") : t("lean.showLog")}</button>
              {showLog ? <pre className="wf-code selectable">{log.join("\n")}</pre> : running ? <div className="last selectable">{log[log.length - 1]}</div> : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The install at a glance, at the foot of the sidebar: a progress ring while it runs, a short note when it needs the
 * user, a moment of "ready" when it finishes, and nothing once Lean works. It opens the full card in a sheet.
 */
export function LeanIndicator({ collapsed }: { collapsed: boolean }) {
  const app = useApp()
  const { t } = useT()
  const status = useLeanStatus(app.workspace.root)
  const data = status.data
  const phase = phaseOf(data)
  const [open, setOpen] = useState(false)
  const [justReady, setJustReady] = useState(false)
  const previous = useRef<Phase>(phase)
  useEffect(() => {
    if (phase === "ready" && previous.current !== "ready" && previous.current !== "loading") {
      setJustReady(true)
      const timer = window.setTimeout(() => setJustReady(false), 6_000)
      previous.current = phase
      return () => window.clearTimeout(timer)
    }
    previous.current = phase
  }, [phase])

  if (phase === "loading" || (phase === "ready" && !justReady)) return null
  const percent = data?.progress?.percent ?? 0
  const label = phase === "ready" ? t("lean.chip.ready") : phase === "installing" ? t("lean.chip.installing") : phase === "retrying" ? t("lean.chip.waiting") : phase === "idle" ? t("lean.chip.stopped") : t("lean.chip.failed")
  const detail = phase === "installing" ? `%${percent} · ${data?.progress?.step ? t(`lean.step.${data.progress.step}` as MessageKey) : t("lean.preparing")}` : phase === "ready" ? t("lean.chip.readyDetail") : t("lean.chip.open")
  const circumference = 2 * Math.PI * 8

  return (
    <>
      <button className={`lean-chip ${phase}`} onClick={() => setOpen(true)} title={collapsed ? `${label} · ${detail}` : undefined} aria-label={`${label}, ${detail}`}>
        <span className="lean-ring" aria-hidden>
          {phase === "installing" ? (
            <svg viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="8" fill="none" stroke="var(--fill-2)" strokeWidth="2.4" />
              <circle cx="10" cy="10" r="8" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.max(0.04, percent / 100))} transform="rotate(-90 10 10)" />
            </svg>
          ) : phase === "retrying" ? <span className="spinner" /> : <Icon name={phase === "ready" ? "check" : "info"} size={13} stroke={2.4} />}
        </span>
        <span className="lean-chip-text">
          <span className="lean-chip-label">{label}</span>
          <span className="lean-chip-detail">{detail}</span>
        </span>
      </button>
      {open && <Sheet open onClose={() => setOpen(false)} title={t("lean.sheetTitle")}><LeanSetup compact /></Sheet>}
    </>
  )
}

/** A one-line notice for pages that need Lean (overview, a claim's steps) while it is not ready. */
export function LeanNotice({ onOpen }: { onOpen: () => void }) {
  const app = useApp()
  const { t } = useT()
  const data = useLeanStatus(app.workspace.root).data
  const phase = phaseOf(data)
  if (phase === "loading" || phase === "ready") return null
  const installing = phase === "installing" || phase === "retrying"
  return (
    <div className="wf-notice no wf-lean" role="status">
      {installing ? <span className="spinner" style={{ marginTop: 2 }} /> : <Icon name="info" size={15} />}
      <div style={{ flex: 1 }}>
        <strong>{installing ? `${t("lean.installing")}${phase === "installing" ? ` · %${data?.progress?.percent ?? 0}` : ""}` : t("lean.bannerTitle")}</strong>
        <div>{t(installing ? "lean.bannerInstalling" : "lean.bannerBody")}</div>
      </div>
      <button className={`btn btn-sm ${installing ? "btn-secondary" : "btn-primary"}`} onClick={onOpen}>{installing ? t("lean.showProgress") : <><Icon name="download" size={14} />{t("lean.setupNow")}</>}</button>
    </div>
  )
}

import { useEffect, useRef, useState } from "react"
import { openExternal, runJson } from "../lib/bridge.ts"
import { useT, type Lang, type MessageKey } from "../lib/i18n.ts"
import { formatDuration, useElapsed, useJob } from "../lib/jobs.ts"
import { leanPhase, startLeanInstall, useLeanStatus } from "../lib/lean.ts"
import { invalidate, useQuery } from "../lib/query.ts"
import { GIT_URL, LEAN_ERRORS } from "../components/LeanSetup.tsx"
import { Icon } from "../components/Icon.tsx"
import { Wordmark } from "../components/Brand.tsx"
import { Segmented } from "../components/Primitives.tsx"

// Commands here run before any workspace is open; they only touch the computer-wide install.
const CWD = "/"
const DOCKER_URL = "https://www.docker.com/products/docker-desktop/"

interface SelfTest { ok: boolean; ms: number; leanVersion: string | null; detail: string | null }
interface SandboxState { needsDocker: boolean; docker: "missing" | "stopped" | "running"; image: boolean; pulling: string | null; lastError: { code: string; message: string } | null; available: boolean }
type RowState = "pending" | "running" | "done" | "failed" | "optional"

/**
 * The first thing a new MathOS shows: everything the computer needs, installed once with visible progress, then
 * checked for real (Lean proves a theorem with Mathlib) before the mathematician starts. Nothing here asks for a
 * decision except the optional Docker step, which is the user's to install.
 */
export function Setup({ onDone, lang, setLang }: { onDone: () => void; lang: Lang; setLang: (lang: Lang) => void }) {
  const { t } = useT()
  const status = useLeanStatus(CWD)
  const lean = status.data
  const phase = leanPhase(lean)
  const job = useJob(CWD, lean?.job ?? null)
  const elapsed = useElapsed(job?.startedAt ?? null, phase === "installing")

  // The health check runs by itself once Lean is installed, and again on request after a failure.
  const [check, setCheck] = useState<{ state: "idle" | "running" | "done"; result: SelfTest | null }>({ state: "idle", result: null })
  const runCheck = async () => {
    setCheck({ state: "running", result: null })
    try { setCheck({ state: "done", result: await runJson<SelfTest>(CWD, ["lean", "check"], { allowNonZero: true }) }) }
    catch (error) { setCheck({ state: "done", result: { ok: false, ms: 0, leanVersion: null, detail: error instanceof Error ? error.message : String(error) } }) }
  }
  useEffect(() => { if (lean?.ready && check.state === "idle") void runCheck() }, [lean?.ready, check.state])

  // Docker is watched while this screen is open, so installing or starting it shows up without a click.
  const sandbox = useQuery("sandbox|state", () => runJson<SandboxState>(CWD, ["sandbox", "status"]), 4_000)
  useEffect(() => { const timer = window.setInterval(() => invalidate("sandbox|state"), 5_000); return () => window.clearInterval(timer) }, [])
  const pulled = useRef(false)
  useEffect(() => {
    const state = sandbox.data
    if (state?.docker === "running" && !state.image && !state.pulling && !state.lastError && !pulled.current) { pulled.current = true; void runJson(CWD, ["sandbox", "prepare"]).then(() => invalidate("sandbox|state")) }
  }, [sandbox.data])

  const healthy = check.result?.ok === true
  const leanPercent = lean?.ready ? 100 : lean?.progress?.percent ?? 0
  const overall = Math.round(leanPercent * 0.9 + (healthy ? 10 : 0))
  const leanRow: RowState = lean?.ready ? "done" : phase === "installing" || phase === "retrying" || phase === "loading" ? "running" : phase === "idle" ? "pending" : "failed"
  const checkRow: RowState = !lean?.ready ? "pending" : check.state === "running" || check.state === "idle" ? "running" : healthy ? "done" : "failed"
  const leanError = lean?.blocker ?? lean?.lastError?.code
  const [starting, setStarting] = useState(false)
  const install = async () => { setStarting(true); try { await startLeanInstall(CWD) } finally { setStarting(false) } }
  // An install that never started on its own (automatic install turned off) starts here; this screen exists for it.
  const autoStarted = useRef(false)
  useEffect(() => { if (phase === "idle" && !autoStarted.current) { autoStarted.current = true; void install() } }, [phase])

  const leanDetail = lean?.ready ? t("setup.lean.done").replace("{version}", lean.pinnedToolchain.replace(/^.*:v?/, ""))
    : phase === "installing" ? `${lean?.progress?.step ? t(`lean.step.${lean.progress.step}` as MessageKey) : t("lean.preparing")} · ${formatDuration(elapsed, lang)}`
    : phase === "retrying" ? t("lean.waitingBody")
    : phase === "blocked" || phase === "failed" ? t(LEAN_ERRORS[leanError ?? ""] ?? "lean.err.generic")
    : t("lean.preparing")

  const box = sandbox.data
  const sandboxRow: RowState = box?.available ? "done" : box?.pulling ? "running" : "optional"
  const sandboxDetail = !box ? t("setup.sandbox.checking")
    : box.available ? t("setup.sandbox.done")
    : !box.needsDocker ? t("setup.sandbox.linux")
    : box.docker === "missing" ? t("setup.sandbox.missing")
    : box.docker === "stopped" ? t("setup.sandbox.stopped")
    : box.pulling ? t("setup.sandbox.pulling")
    : box.lastError ? t("setup.sandbox.failed") : t("setup.sandbox.checking")

  return (
    <div className="setup">
      <div className="titlebar-drag" data-tauri-drag-region />
      <div className="welcome-corner">
        <Segmented value={lang} onChange={setLang} label={t("settings.language")} options={[{ value: "tr", label: "TR" }, { value: "en", label: "EN" }]} />
      </div>
      <div className="setup-inner">
        <div className="setup-logo"><Wordmark height={72} /></div>
        <h1 className="setup-title">{healthy ? t("setup.readyTitle") : t("setup.title")}</h1>
        <p className="setup-lead">{healthy ? t("setup.readyLead") : t("setup.lead")}</p>

        <div className="setup-overall" role="progressbar" aria-valuenow={overall} aria-valuemin={0} aria-valuemax={100} aria-label={t("setup.title")}>
          <div className="setup-overall-bar"><i style={{ transform: `scaleX(${Math.max(0.015, overall / 100)})` }} /></div>
          <span className="pct">%{overall}</span>
        </div>

        <ol className="setup-rows card">
          <SetupRow index={1} state={leanRow} title={t("setup.lean.title")} body={t("setup.lean.body")} detail={leanDetail}
            percent={phase === "installing" ? leanPercent : undefined}
            action={leanRow === "failed" ? <>
              {leanError === "LEAN_INSTALL_GIT_MISSING" && <button className="btn btn-secondary btn-sm" onClick={() => void openExternal(GIT_URL)}>{t("lean.getGit")}</button>}
              <button className="btn btn-primary btn-sm" onClick={() => void install()} disabled={starting}>{starting ? <span className="spinner" /> : <Icon name="refresh" size={14} />}{t("lean.retry")}</button>
            </> : phase === "retrying" ? <button className="btn btn-secondary btn-sm" onClick={() => void install()} disabled={starting}>{t("lean.retryNow")}</button> : null} />
          <SetupRow index={2} state={checkRow} title={t("setup.check.title")} body={t("setup.check.body")}
            detail={checkRow === "pending" ? t("setup.check.waiting") : checkRow === "running" ? t("setup.check.running") : healthy ? t("setup.check.done").replace("{seconds}", (check.result!.ms / 1000).toLocaleString(lang, { maximumFractionDigits: 1 })) : t("setup.check.failed")}
            extra={checkRow === "failed" && check.result?.detail ? <pre className="wf-code selectable">{check.result.detail}</pre> : null}
            action={checkRow === "failed" ? <button className="btn btn-primary btn-sm" onClick={() => void runCheck()}><Icon name="refresh" size={14} />{t("lean.retry")}</button> : null} />
          <SetupRow index={3} state={sandboxRow} title={t("setup.sandbox.title")} optional={t("setup.optional")} body={t("setup.sandbox.body")} detail={sandboxDetail}
            action={box?.needsDocker && box.docker === "missing" ? <button className="btn btn-secondary btn-sm" onClick={() => void openExternal(DOCKER_URL)}>{t("setup.sandbox.get")}</button>
              : box?.lastError ? <button className="btn btn-secondary btn-sm" onClick={() => { pulled.current = false; void runJson(CWD, ["sandbox", "prepare"]).then(() => invalidate("sandbox|state")) }}>{t("lean.retry")}</button> : null} />
        </ol>

        <div className="setup-foot">
          <button className="btn btn-primary btn-lg" onClick={onDone} disabled={!healthy}>{healthy ? <>{t("setup.start")}<Icon name="arrow" size={16} /></> : t("setup.startWaiting")}</button>
          {!healthy && <button className="link-btn setup-skip" onClick={onDone}>{t("setup.skip")}</button>}
        </div>
      </div>
    </div>
  )
}

function SetupRow({ index, state, title, body, detail, percent, optional, action, extra }: { index: number; state: RowState; title: string; body: string; detail: string; percent?: number; optional?: string; action?: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <li className={`setup-row ${state}`}>
      <span className="setup-dot" aria-hidden>
        {state === "running" ? <span className="spinner" /> : state === "done" ? <Icon name="check" size={13} stroke={2.6} /> : state === "failed" ? <Icon name="x" size={13} stroke={2.6} /> : index}
      </span>
      <div className="setup-row-main">
        <div className="setup-row-head">
          <strong>{title}</strong>
          {optional && <span className="pill pill-dashed">{optional}</span>}
          {percent !== undefined && <span className="pct">%{percent}</span>}
        </div>
        <div className="setup-row-body">{body}</div>
        {percent !== undefined && <div className="setup-row-bar"><i style={{ transform: `scaleX(${Math.max(0.02, percent / 100)})` }} /></div>}
        <div className="setup-row-detail" aria-live="polite">{detail}</div>
        {extra}
        {action && <div className="setup-row-actions">{action}</div>}
      </div>
    </li>
  )
}

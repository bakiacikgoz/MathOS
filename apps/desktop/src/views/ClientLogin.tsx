import { useCallback, useEffect, useRef, useState } from "react"
import { useApp } from "../lib/app.ts"
import { openExternal, runJson } from "../lib/bridge.ts"
import { invalidate } from "../lib/query.ts"
import { useT, type MessageKey } from "../lib/i18n.ts"
import { providerKeys } from "../lib/providers.ts"
import { errorText } from "../lib/cli-text.ts"
import { Icon } from "../components/Icon.tsx"

// Shape of `mathos provider login <profile> --json [--check|--background|--window]`.
type LoginReply =
  | { state: "CLIENT_MISSING"; clientName: string; install: { url: string; command: string } }
  | { state: "SIGNED_IN"; clientName: string }
  | { state: "SIGNED_OUT"; clientName: string; mode: "background" | "window"; verifiable: boolean; hint: string | null }
  | { state: "LOGIN_STARTED"; clientName: string }
  | { state: "LOGIN_WINDOW_OPENED"; clientName: string; hint: string | null }
  | { state: "TERMINAL_UNAVAILABLE"; clientName: string; command: string }

type Phase =
  | { kind: "checking" }
  | { kind: "missing"; install: { url: string; command: string }; installerOpened: boolean }
  | { kind: "signedOut"; mode: "background" | "window"; verifiable: boolean; hint: string | null }
  | { kind: "waiting" }
  | { kind: "window"; hint: string | null; verifiable: boolean }
  | { kind: "manual"; command: string }
  | { kind: "signedIn" }
  | { kind: "error"; message: string }

const HINTS: Record<string, MessageKey> = { "gemini-sign-in": "login.hint.gemini", "qwen-auth": "login.hint.qwen", "copilot-login": "login.hint.copilot" }
const POLL_MS = 2_500, POLL_LIMIT_MS = 10 * 60_000

/** Sign-in for official-client providers: one button, the vendor's page opens, MathOS notices when it is done. */
export function ClientLogin({ profile, accountName, onSignedIn }: { profile: string; accountName: string; onSignedIn: () => void }) {
  const app = useApp()
  const { t } = useT()
  const root = app.workspace.root
  const [phase, setPhase] = useState<Phase>({ kind: "checking" })
  const [client, setClient] = useState("")
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const done = useRef(onSignedIn); done.current = onSignedIn
  const appRef = useRef(app); appRef.current = app
  // StrictMode mounts twice in development, so set the flag on every mount, not only at creation.
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const ask = useCallback((...flags: string[]) => runJson<LoginReply>(root, ["provider", "login", profile, "--json", ...flags]), [root, profile])
  const settle = useCallback((reply: LoginReply) => {
    if (!alive.current) return
    setClient(reply.clientName)
    if (reply.state === "SIGNED_IN") {
      // Move on by itself only when sign-in just finished here, not when the user came back to a step that was already done.
      setPhase((value) => {
        if (value.kind === "waiting" || value.kind === "window") window.setTimeout(() => { if (alive.current) done.current() }, 900)
        return { kind: "signedIn" }
      })
      invalidate(providerKeys.all)
    } else if (reply.state === "CLIENT_MISSING") setPhase((value) => ({ kind: "missing", install: reply.install, installerOpened: value.kind === "missing" && value.installerOpened }))
    else if (reply.state === "SIGNED_OUT") setPhase({ kind: "signedOut", mode: reply.mode, verifiable: reply.verifiable, hint: reply.hint })
    else if (reply.state === "LOGIN_STARTED") setPhase({ kind: "waiting" })
    else if (reply.state === "LOGIN_WINDOW_OPENED") setPhase((value) => ({ kind: "window", hint: reply.hint, verifiable: value.kind === "waiting" || (value.kind === "signedOut" && value.verifiable) }))
    else setPhase({ kind: "manual", command: reply.command })
  }, [])
  const act = useCallback(async (...flags: string[]) => {
    setBusy(true)
    // A failed first check must not leave the step spinning; other failures keep the current screen.
    try { settle(await ask(...flags)) } catch (error) { if (!alive.current) return; const message = errorText(error, appRef.current.lang); setPhase((value) => value.kind === "checking" ? { kind: "error", message } : value); if (flags[0] !== "--check") appRef.current.toast(message, "error") } finally { if (alive.current) setBusy(false) }
  }, [ask, settle])

  useEffect(() => { void act("--check") }, [act])

  // While the browser (or the client's window) is open, ask the client every few seconds whether sign-in finished.
  const polling = phase.kind === "waiting" || (phase.kind === "window" && phase.verifiable)
  useEffect(() => {
    if (!polling) return
    const started = Date.now()
    let timer = 0
    const tick = async () => {
      try { const reply = await ask("--check"); if (reply.state === "SIGNED_IN") { settle(reply); return } } catch {}
      if (alive.current && Date.now() - started < POLL_LIMIT_MS) timer = window.setTimeout(tick, POLL_MS)
    }
    timer = window.setTimeout(tick, POLL_MS)
    return () => window.clearTimeout(timer)
  }, [polling, ask, settle])

  const name = client || accountName
  if (phase.kind === "checking") return <div className="login-panel"><span className="spinner" /><span className="field-hint">{t("login.checking")}</span></div>

  if (phase.kind === "error") return (
    <div className="login-panel column" role="alert">
      <div className="login-row"><span className="login-badge"><Icon name="info" size={16} /></span><div><strong>{t("login.errorTitle")}</strong><p className="field-hint">{phase.message}</p></div></div>
      <button className="link-btn" disabled={busy} onClick={() => { setPhase({ kind: "checking" }); void act("--check") }}><Icon name="refresh" size={13} /> {t("login.recheck")}</button>
    </div>
  )

  if (phase.kind === "signedIn") return (
    <div className="login-panel ok" role="status"><span className="login-badge ok"><Icon name="check" size={18} stroke={2.4} /></span>
      <div><strong>{t("login.signedIn")}</strong><p className="field-hint">{t("login.signedInHint")}</p></div></div>
  )

  if (phase.kind === "missing") return (
    <div className="login-panel column">
      <div className="login-row"><span className="login-badge"><Icon name="download" size={17} /></span>
        <div><strong>{t("login.missingTitle").replace("{client}", name)}</strong><p className="field-hint">{t("login.missingHint").replace("{client}", name)}</p></div></div>
      <div className="login-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => void (async () => {
          setBusy(true)
          try {
            const reply = await runJson<{ opened: boolean }>(root, ["provider", "install-client", profile, "--json"])
            if (!reply.opened) { void openExternal(phase.install.url); app.toast(t("login.installerManual")) }
            else setPhase({ ...phase, installerOpened: true })
          } catch (error) { app.toast(errorText(error, app.lang), "error") } finally { setBusy(false) }
        })()}>{t("login.installForMe")}</button>
        <button className="btn btn-secondary" onClick={() => void openExternal(phase.install.url)}>{t("login.installPage")} <Icon name="arrow" size={13} /></button>
      </div>
      {phase.installerOpened && <p className="callout" role="status"><Icon name="info" size={16} /><span>{t("login.installerOpened")}</span></p>}
      <code className="command selectable small">{phase.install.command}</code>
      <button className="link-btn" disabled={busy} onClick={() => void act("--check")}>{busy ? <span className="spinner" /> : <Icon name="refresh" size={13} />} {t("login.recheck")}</button>
    </div>
  )

  if (phase.kind === "waiting") return (
    <div className="login-panel column" role="status">
      <div className="login-row"><span className="spinner lg" /><div><strong>{t("login.waitingTitle")}</strong><p className="field-hint">{t("login.waitingHint").replace("{client}", name)}</p></div></div>
      <button className="link-btn" disabled={busy} onClick={() => void act("--window")}>{t("login.noBrowser")}</button>
    </div>
  )

  if (phase.kind === "window") return (
    <div className="login-panel column" role="status">
      <div className="login-row"><span className="login-badge"><Icon name="console" size={16} /></span>
        <div><strong>{t("login.windowTitle").replace("{client}", name)}</strong><p className="field-hint">{phase.hint && HINTS[phase.hint] ? t(HINTS[phase.hint]!) : t("login.windowHint")}</p></div></div>
      {phase.verifiable ? <p className="field-hint"><span className="spinner" /> {t("login.watching")}</p>
        : <div className="login-actions"><button className="btn btn-primary" onClick={() => done.current()}>{t("login.doneContinue")}</button></div>}
    </div>
  )

  if (phase.kind === "manual") return (
    <div className="login-panel column">
      <div className="login-row"><span className="login-badge"><Icon name="console" size={16} /></span><div><strong>{t("login.manualTitle")}</strong><p className="field-hint">{t("login.manualHint")}</p></div></div>
      <code className="command selectable">{phase.command}</code>
      <button className="link-btn" disabled={busy} onClick={() => void act("--check")}><Icon name="refresh" size={13} /> {t("login.recheck")}</button>
    </div>
  )

  // Signed out: one button.
  return (
    <div className="login-panel column">
      <button className="btn btn-primary btn-lg login-cta" disabled={busy} onClick={() => void act(phase.mode === "window" ? "--window" : "--background")}>
        {busy ? <span className="spinner" /> : null}{t(phase.mode === "window" ? "login.openWindow" : "login.signInWith").replace("{account}", accountName).replace("{client}", name)}
      </button>
      <p className="field-hint center">{t(phase.mode === "window" ? "login.windowIntro" : "login.browserIntro").replace("{client}", name)}</p>
    </div>
  )
}

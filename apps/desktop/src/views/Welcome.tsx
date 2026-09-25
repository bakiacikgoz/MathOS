import { useState } from "react"
import { MathosError, pickFolder, run, runJson } from "../lib/bridge.ts"
import { useT } from "../lib/i18n.ts"
import type { RecentWorkspace, Workspace, StatusProjection } from "../lib/app.ts"
import type { ThemePref } from "../lib/theme.ts"
import { Icon, Mark } from "../components/Icon.tsx"
import { HelpButton, useAutoTour } from "../components/Tour.tsx"
import { Segmented } from "../components/Primitives.tsx"
import type { Lang } from "../lib/i18n.ts"
import { errorText } from "../lib/cli-text.ts"
import { Sheet } from "../components/Overlay.tsx"

interface Props {
  setLang: (lang: Lang) => void
  recent: RecentWorkspace[]
  onOpen: (workspace: Workspace) => void
  onForget: (root: string) => void
  toast: (text: string, kind?: "ok" | "error") => void
  theme: { pref: ThemePref; set: (pref: ThemePref, origin?: { x: number; y: number }) => void }
}

export async function inspectWorkspace(path: string): Promise<Workspace> {
  const { status } = await runJson<{ status: StatusProjection }>(path, ["status"])
  return { root: status.workspaceRoot, name: status.projectName }
}

export function Welcome({ recent, onOpen, onForget, toast, theme, setLang }: Props) {
  const { t, lang } = useT()
  useAutoTour("welcome")
  const [busy, setBusy] = useState<string | null>(null)
  const [sheet, setSheet] = useState<null | "create" | "demo">(null)
  const [notWorkspace, setNotWorkspace] = useState<string | null>(null)

  const open = async (path: string) => {
    setBusy(path)
    try { onOpen(await inspectWorkspace(path)) }
    catch (error) {
      if (error instanceof MathosError && /WORKSPACE.?NOT.?FOUND/i.test(error.code)) setNotWorkspace(path)
      else toast(errorText(error, lang), "error")
    } finally { setBusy(null) }
  }
  const choose = async () => { const path = await pickFolder(t("welcome.pickFolder")); if (path) await open(path) }
  const initHere = async () => {
    if (!notWorkspace) return
    setBusy(notWorkspace)
    try { const created = await runJson<{ root: string; name: string }>(notWorkspace, ["init"]); setNotWorkspace(null); onOpen({ root: created.root, name: created.name }) }
    catch (error) { toast(errorText(error, lang), "error") } finally { setBusy(null) }
  }
  const cycleTheme = (event: React.MouseEvent) => {
    const order: ThemePref[] = ["system", "light", "dark"]
    theme.set(order[(order.indexOf(theme.pref) + 1) % order.length]!, { x: event.clientX, y: event.clientY })
  }

  return (
    <div className="welcome">
      <div className="titlebar-drag" data-tauri-drag-region />
      <div className="welcome-corner">
        <Segmented value={lang} onChange={setLang} label={t("settings.language")} options={[{ value: "tr", label: "TR" }, { value: "en", label: "EN" }]} />
        <HelpButton tour="welcome" />
        <button className="btn btn-ghost btn-icon" onClick={cycleTheme} title={t("settings.appearance")} aria-label={t("settings.appearance")}>
          <Icon name={theme.pref === "system" ? "system" : theme.pref === "dark" ? "moon" : "sun"} />
        </button>
      </div>
      <div className="welcome-inner">
        <div className="welcome-mark"><Mark size={88} /></div>
        <h1>{t("welcome.title")}</h1>
        <p className="lead">{t("welcome.subtitle")}</p>

        <div className="welcome-actions stagger">
          <button data-tour="welcome-open" className="card card-interactive action-card primary" style={{ "--i": 3 } as React.CSSProperties} onClick={choose} disabled={!!busy}>
            <div className="icon-wrap"><Icon name="folder" /></div>
            <div><strong>{t("welcome.open")}</strong><span>{t("welcome.openHint")}</span></div>
          </button>
          <button data-tour="welcome-new" className="card card-interactive action-card" style={{ "--i": 4 } as React.CSSProperties} onClick={() => setSheet("create")}>
            <div className="icon-wrap"><Icon name="plus" /></div>
            <div><strong>{t("welcome.create")}</strong><span>{t("welcome.createHint")}</span></div>
          </button>
          <button data-tour="welcome-demo" className="card card-interactive action-card" style={{ "--i": 5 } as React.CSSProperties} onClick={() => setSheet("demo")}>
            <div className="icon-wrap"><Icon name="sparkles" /></div>
            <div><strong>{t("welcome.demo")}</strong><span>{t("welcome.demoHint")}</span></div>
          </button>
        </div>

        {notWorkspace && (
          <div className="error-box" style={{ marginTop: 20, width: "100%", animation: "rise 300ms var(--ease) both" }}>
            <Icon name="info" />
            <div style={{ flex: 1, textAlign: "left" }}><strong>{t("welcome.notWorkspace")}</strong><code>{notWorkspace}</code></div>
            <button className="btn btn-secondary" onClick={() => setNotWorkspace(null)}>{t("common.cancel")}</button>
            <button className="btn btn-primary" onClick={initHere} disabled={!!busy}>{busy ? <span className="spinner" /> : t("welcome.initHere")}</button>
          </div>
        )}

        {recent.length > 0 && (
          <div className="recent">
            <div className="section-title">{t("welcome.recent")}</div>
            <div className="card stagger" style={{ padding: 6 }}>
              {recent.map((row, index) => (
                <div key={row.root} className="recent-row" style={{ "--i": index + 6 } as React.CSSProperties} role="button" tabIndex={0}
                  onClick={() => open(row.root)} onKeyDown={(event) => { if (event.key === "Enter") void open(row.root) }}>
                  <Mark size={26} />
                  <div className="meta"><div className="name">{row.name}</div><div className="path">{row.root}</div></div>
                  {busy === row.root ? <span className="spinner" /> : (
                    <button className="btn btn-ghost btn-icon remove" aria-label={t("welcome.remove")} title={t("welcome.remove")} onClick={(event) => { event.stopPropagation(); onForget(row.root) }}><Icon name="x" size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <CreateSheet mode={sheet} onClose={() => setSheet(null)} onCreated={(workspace) => { setSheet(null); onOpen(workspace) }} toast={toast} />
    </div>
  )
}

function CreateSheet({ mode, onClose, onCreated, toast }: { mode: null | "create" | "demo"; onClose: () => void; onCreated: (workspace: Workspace) => void; toast: Props["toast"] }) {
  const { t, lang } = useT()
  const [name, setName] = useState("")
  const [parent, setParent] = useState("")
  const [busy, setBusy] = useState(false)
  const demo = mode === "demo"
  const finalName = name.trim() || (demo ? "mathos-demo" : "")
  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault()
    if (!finalName || !parent) return
    setBusy(true)
    try {
      if (demo) {
        const result = await run(parent, ["demo", "create", "--name", finalName])
        const root = result.stdout.trim().split("\n")[1]?.trim()
        if (!root) throw new Error(result.stdout)
        onCreated(await inspectWorkspace(root))
      } else {
        const created = await runJson<{ root: string; name: string }>(parent, ["init", "--name", finalName])
        onCreated({ root: created.root, name: created.name })
      }
      setName("")
    } catch (error) { toast(errorText(error, lang), "error") } finally { setBusy(false) }
  }
  return (
    <Sheet open={mode !== null} onClose={onClose} title={demo ? t("create.demoTitle") : t("create.title")}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn btn-primary" onClick={() => submit()} disabled={busy || !finalName || !parent}>{busy ? <span className="spinner" /> : t("create.submit")}</button>
      </>}>
      <form onSubmit={submit} style={{ display: "contents" }}>
        <label className="field">
          <span className="field-label">{t("create.name")}</span>
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder={demo ? "mathos-demo" : t("create.namePlaceholder")} spellCheck={false} />
        </label>
        <div className="field">
          <span className="field-label">{t("create.location")}</span>
          <div style={{ display: "flex", gap: 10 }}>
            <input className="input" value={parent} onChange={(event) => setParent(event.target.value)} placeholder="~/Research" spellCheck={false} />
            <button type="button" className="btn btn-secondary" onClick={async () => { const path = await pickFolder(t("welcome.pickParent")); if (path) setParent(path) }}>{t("create.choose")}</button>
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}

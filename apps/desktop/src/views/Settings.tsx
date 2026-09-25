import { Fragment, useEffect, useState } from "react"
import { mod, useApp } from "../lib/app.ts"
import { hostInfo, restartHost, type HostInfo } from "../lib/bridge.ts"
import { clearCache } from "../lib/query.ts"
import { useT } from "../lib/i18n.ts"
import type { ThemePref } from "../lib/theme.ts"
import { Icon } from "../components/Icon.tsx"
import { HelpButton, useAutoTour, useTours } from "../components/Tour.tsx"
import { Segmented } from "../components/Primitives.tsx"

export function Settings() {
  const app = useApp()
  const { t } = useT()
  const [info, setInfo] = useState<HostInfo | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { void hostInfo().then(setInfo).catch(() => setInfo(null)) }, [])

  const themes: Array<{ value: ThemePref; label: string }> = [
    { value: "system", label: t("settings.system") }, { value: "light", label: t("settings.light") }, { value: "dark", label: t("settings.dark") },
  ]
  const shortcuts: Array<[string, string]> = [
    [t("nav.search"), `${mod}K`], [t("claimForm.title"), `${mod}N`],
    [t("nav.overview"), `${mod}1`], [t("nav.claims"), `${mod}2`], [t("nav.branches"), `${mod}3`], [t("nav.health"), `${mod}4`], [t("nav.console"), `${mod}5`],
    [t("nav.settings"), `${mod},`],
  ]

  const tours = useTours()
  useAutoTour("settings", true, "app")
  return (
    <div className="page-inner" style={{ maxWidth: 760 }}>
      <div className="page-head"><div><div className="eyebrow">MathOS</div><h1 className="title">{t("nav.settings")}</h1></div><HelpButton tour="settings" /></div>

      <div className="settings-group">
        <div className="section-title" style={{ marginTop: 0 }}>{t("settings.appearance")}</div>
        <div className="card theme-cards" data-tour="settings-appearance">
          {themes.map((theme) => (
            <button key={theme.value} className={`theme-card ${app.theme.pref === theme.value ? "active" : ""}`} onClick={(event) => app.theme.set(theme.value, { x: event.clientX, y: event.clientY })}>
              <div className="preview">
                {theme.value !== "dark" && <div className="pv-light"><i /><b /></div>}
                {theme.value !== "light" && <div className={`pv-dark ${theme.value === "system" ? "half" : ""}`}><i /><b /></div>}
              </div>
              {theme.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <div className="section-title">{t("settings.language")}</div>
        <div className="card" data-tour="settings-language"><div className="settings-row"><div className="k"><Icon name="globe" size={16} /> {t("settings.language")}</div>
          <Segmented value={app.lang} onChange={app.setLang} options={[{ value: "tr", label: "Türkçe" }, { value: "en", label: "English" }]} />
        </div></div>
      </div>

      <div className="settings-group">
        <div className="section-title">{t("tour.settingsTitle")}</div>
        <div className="card" data-tour="settings-tours">
          <div className="settings-row"><div><div className="k">{t("tour.autoTitle")}</div><div className="d">{t("tour.autoHint")}</div></div>
            <Segmented value={tours.prefs.auto ? "on" : "off"} onChange={(value) => tours.setAuto(value === "on")} options={[{ value: "on", label: t("tour.on") }, { value: "off", label: t("tour.offShort") }]} /></div>
          <div className="settings-row"><div><div className="k">{t("tour.resetTitle")}</div><div className="d">{t("tour.resetHint")}</div></div>
            <button className="btn btn-secondary" onClick={() => { tours.reset(); app.navigate("overview"); app.toast(t("tour.resetDone")) }}>{t("tour.reset")}</button></div>
        </div>
      </div>

      <div className="settings-group">
        <div className="section-title">{t("settings.workspace")}</div>
        <div className="card">
          <div className="settings-row"><div><div className="k">{app.workspace.name}</div><div className="d selectable">{app.workspace.root}</div></div>
            <button className="btn btn-secondary" onClick={app.closeWorkspace}>{t("settings.close")}</button></div>
        </div>
      </div>

      <div className="settings-group">
        <div className="section-title">{t("settings.engine")}</div>
        <div className="card">
          <div className="settings-row">
            <div><div className="k">{info?.running ? t("settings.engineRunning") : t("settings.engineIdle")}{info?.version ? ` · ${info.version}` : ""}</div><div className="d selectable">{t("settings.source")}: {info?.source ?? "—"}</div></div>
            <button className="btn btn-secondary" disabled={busy} onClick={async () => { setBusy(true); try { await restartHost(); clearCache(); setInfo(await hostInfo()) } finally { setBusy(false) } }}>
              {busy ? <span className="spinner" /> : <Icon name="refresh" size={16} />}{t("settings.restart")}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="section-title">{t("settings.shortcuts")}</div>
        <div className="card shortcut-list">{shortcuts.map(([label, key]) => <Fragment key={key}><span>{label}</span><span className="kbd" style={{ justifySelf: "end" }}>{key}</span></Fragment>)}</div>
      </div>
    </div>
  )
}

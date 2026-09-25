import { useState } from "react"
import { useApp } from "../lib/app.ts"
import { useT } from "../lib/i18n.ts"
import { setRemoteModels, useRemoteModels } from "../lib/privacy.ts"
import { errorText } from "../lib/cli-text.ts"
import { Icon } from "./Icon.tsx"
import { Segmented } from "./Primitives.tsx"

function useToggle() {
  const app = useApp()
  const { t } = useT()
  const setting = useRemoteModels(app.workspace.root)
  const [busy, setBusy] = useState(false)
  const change = async (allowed: boolean) => {
    setBusy(true)
    try {
      const after = await setRemoteModels(app.workspace.root, allowed)
      // A value in the workspace's mathos.toml or the environment overrides the app setting; say so instead of pretending.
      if (after.value !== allowed) app.toast(t(after.source === "env" ? "privacy.overriddenEnv" : "privacy.overriddenWorkspace"), "error")
      else app.toast(t(allowed ? "privacy.enabled" : "privacy.disabled"))
      void setting.refetch()
    } catch (error) { app.toast(errorText(error, app.lang), "error") } finally { setBusy(false) }
  }
  return { setting, busy, change }
}

/** Settings row: allow or block cloud models. */
export function RemoteModelsSetting() {
  const { t } = useT()
  const { setting, busy, change } = useToggle()
  const on = setting.data?.value === true
  return (
    <div className="settings-row">
      <div><div className="k">{t("privacy.remoteTitle")}</div><div className="d prose">{t(on ? "privacy.remoteOnHint" : "privacy.remoteOffHint")}</div>
        {setting.data && ["workspace", "env"].includes(setting.data.source) && <div className="d prose">{t(setting.data.source === "env" ? "privacy.fromEnv" : "privacy.fromWorkspace")}</div>}</div>
      {busy ? <span className="spinner" /> : <Segmented value={on ? "on" : "off"} onChange={(value) => void change(value === "on")} label={t("privacy.remoteTitle")} options={[{ value: "off", label: t("privacy.off") }, { value: "on", label: t("privacy.on") }]} />}
    </div>
  )
}

/** Shown where a cloud model would be used while cloud models are off: explains why and turns them on in one click. */
export function RemoteBlockedCallout({ compact = false }: { compact?: boolean }) {
  const { t } = useT()
  const { setting, busy, change } = useToggle()
  if (!setting.data || setting.data.value) return null
  return (
    <div className={`callout privacy-callout ${compact ? "compact" : ""}`} role="status">
      <Icon name="info" size={16} />
      <div className="grow"><strong>{t("privacy.blockedTitle")}</strong><span>{t("privacy.blockedHint")}</span></div>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void change(true)}>{busy ? <span className="spinner" /> : t("privacy.allow")}</button>
    </div>
  )
}

import { useMemo, useState } from "react"
import { Icon } from "./Icon.tsx"
import { Sheet } from "./Overlay.tsx"
import { useT } from "../lib/i18n.ts"
import { errorText } from "../lib/cli-text.ts"
import { renderMarkdown } from "../lib/markdown.ts"
import { openExternal } from "../lib/bridge.ts"
import { canInstallInApp, dismissUpdate, installUpdate, useUpdates } from "../lib/updates.ts"

/** The sidebar's notice that a newer MathOS is out; it opens the sheet with the notes and the update button. */
export function UpdateIndicator({ collapsed }: { collapsed: boolean }) {
  const { t, lang } = useT()
  const updates = useUpdates()
  const [open, setOpen] = useState(false)
  const status = updates.status
  const busy = updates.phase === "downloading" || updates.phase === "installing"
  const failed = updates.phase === "failed" && status?.available
  if (!status?.available || (!busy && !failed && updates.dismissed === status.latestVersion)) return <UpdateSheet open={open} onClose={() => setOpen(false)} />
  const label = updates.phase === "downloading" ? t("update.downloading") : updates.phase === "installing" ? t("update.installing") : failed ? t("update.failed") : t("update.ready").replace("{version}", status.latestVersion)
  const detail = busy ? t("update.busyDetail") : failed ? errorText(updates.error, lang) : t(canInstallInApp ? "update.readyDetail" : "update.readyDetailPage")
  return (
    <>
      <div className={`update-chip ${failed ? "failed" : busy ? "busy" : ""}`}>
        <button className="update-chip-main" onClick={() => setOpen(true)} title={collapsed ? `${label} · ${detail}` : undefined} aria-label={`${label}, ${detail}`}>
          <span className="update-badge" aria-hidden>{busy ? <span className="spinner" /> : <Icon name="download" size={13} stroke={2.2} />}</span>
          <span className="update-chip-text"><span className="update-chip-label">{label}</span><span className="update-chip-detail">{detail}</span></span>
        </button>
        {!busy && !collapsed && <button className="update-chip-close" onClick={dismissUpdate} aria-label={t("update.later")} title={t("update.later")}><Icon name="x" size={12} /></button>}
      </div>
      <UpdateSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** What is new in the release, and the one button that installs it. */
export function UpdateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useT()
  const updates = useUpdates()
  const status = updates.status
  const notes = useMemo(() => status?.notes ? renderMarkdown(status.notes, t("common.copy")) : "", [status?.notes, t])
  const busy = updates.phase === "downloading" || updates.phase === "installing"
  if (!status) return null
  return (
    <Sheet open={open} onClose={onClose} title={t("update.title").replace("{version}", status.latestVersion)}
      footer={<>
        <button className="btn btn-ghost" onClick={() => void openExternal(status.url)}>{t("update.notes")}</button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-secondary" disabled={busy} onClick={() => { dismissUpdate(); onClose() }}>{t("update.later")}</button>
        {status.available && <button className="btn btn-primary" disabled={busy} onClick={() => void installUpdate()}>
          {busy ? <span className="spinner" /> : <Icon name="download" size={15} />}{busy ? t(updates.phase === "installing" ? "update.installing" : "update.downloading") : t(canInstallInApp ? "update.install" : "update.openPage")}
        </button>}
      </>}>
      <p className="update-lead">{t(canInstallInApp ? "update.lead" : "update.leadPage").replace("{current}", status.currentVersion).replace("{version}", status.latestVersion)}</p>
      {updates.phase === "failed" && <div className="chat-error" role="alert"><Icon name="info" size={15} /><span>{errorText(updates.error, lang)}</span></div>}
      {notes && <div className="md update-notes selectable" dangerouslySetInnerHTML={{ __html: notes }} />}
    </Sheet>
  )
}

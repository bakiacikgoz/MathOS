import { useEffect, useState } from "react"
import { useApp } from "../lib/app.ts"
import { useT } from "../lib/i18n.ts"
import { pickFile, pickFolder, run, runJson } from "../lib/bridge.ts"
import { invalidate, useQuery } from "../lib/query.ts"
import { errorText } from "../lib/cli-text.ts"
import { renderMarkdown } from "../lib/markdown.ts"
import { exportDocument, revealFile, type ExportFormat } from "../lib/exports.ts"
import { Icon } from "../components/Icon.tsx"
import { Empty, ErrorBox, Skeleton } from "../components/Primitives.tsx"

interface ReportRow { name: string; format: "md" | "json"; bytes: number; modifiedAt: string }
const reportsKey = (root: string) => `${root}|reports`

const when = (iso: string, lang: "tr" | "en") => new Date(iso).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { dateStyle: "medium", timeStyle: "short" })
const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`
const dirOf = (path: string) => path.replace(/[\\/][^\\/]*$/, "")

/** Everything that leaves the workspace: research reports (and their PDF/Word copies), backups and restoring one. */
export function Reports() {
  const app = useApp()
  const { t, lang } = useT()
  const root = app.workspace.root
  const list = useQuery(reportsKey(root), () => runJson<{ dir: string; reports: ReportRow[] }>(root, ["report", "list"]))
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const reports = list.data?.reports ?? []
  useEffect(() => { if (!selected && reports[0]) setSelected(reports[0].name) }, [reports, selected])
  const preview = useQuery(selected ? `${reportsKey(root)}|${selected}` : null, () => runJson<{ name: string; path: string; content: string }>(root, ["report", "show", selected!]), 60_000)

  const act = async (key: string, work: () => Promise<void>) => { setBusy(key); try { await work() } catch (error) { app.toast(errorText(error, lang), "error") } finally { setBusy(null) } }
  const create = (format: "md" | "json") => act(`create-${format}`, async () => {
    const made = await runJson<{ name: string }>(root, ["report", "--format", format, "--with-content"])
    invalidate(reportsKey(root)); setSelected(made.name); app.toast(t("reports.created"))
  })
  const exportAs = (format: ExportFormat) => act(`export-${format}`, async () => {
    if (!preview.data) return
    const title = t("reports.docTitle").replace("{name}", app.workspace.name)
    const path = await exportDocument(root, lang, { title, format: "markdown", content: preview.data.content }, format)
    if (path) { app.toast(t("chat.saved").replace("{path}", path.split(/[\\/]/).pop() ?? path)); if (/[\\/]/.test(path)) void revealFile(path).catch(() => {}) }
  })
  const backup = () => act("backup", async () => {
    const folder = await pickFolder(t("reports.backupWhere"))
    if (!folder) return
    const result = await run(root, ["backup", "--out", folder])
    const archive = result.stdout.trim().split("\n").pop() ?? ""
    app.toast(t("reports.backedUp").replace("{name}", archive.split(/[\\/]/).pop() ?? archive))
    void revealFile(archive).catch(() => {})
  })
  const restore = () => act("restore", async () => {
    const archive = await pickFile(t("reports.restorePick"), ["tgz"])
    if (!archive) return
    const target = await pickFolder(t("reports.restoreWhere"))
    if (!target) return
    const result = await run(root, ["restore", archive, "--into", target])
    const restored = /Restored\s+(.+)$/m.exec(result.stdout)?.[1]?.trim() ?? target
    if (window.confirm(t("reports.restoredOpen").replace("{path}", restored))) app.openWorkspace({ root: restored, name: restored.split(/[\\/]/).pop() ?? restored })
  })

  const current = reports.find((row) => row.name === selected)
  return (
    <div className="page-inner">
      <div className="page-head">
        <div><div className="eyebrow eyebrow-name">{app.workspace.name}</div><h1 className="title">{t("reports.title")}</h1><p className="subtitle">{t("reports.subtitle")}</p></div>
      </div>

      <section className="card reports-card">
        <div className="reports-head">
          <div><h2 className="section-h">{t("reports.reportTitle")}</h2><p className="field-hint">{t("reports.reportHint")}</p></div>
          <div className="wf-actions">
            <button className="btn btn-primary" onClick={() => void create("md")} disabled={busy !== null}>{busy === "create-md" ? <span className="spinner" /> : <Icon name="file" size={15} />}{t("reports.newReport")}</button>
            <button className="btn btn-secondary" onClick={() => void create("json")} disabled={busy !== null}>{busy === "create-json" ? <span className="spinner" /> : null}JSON</button>
          </div>
        </div>
        {list.error ? <ErrorBox error={list.error} onRetry={() => list.refetch()} /> : null}
        {!list.data && !list.error ? <Skeleton height={120} /> : !reports.length ? <Empty glyph="∅" title={t("reports.none")}><p className="field-hint">{t("reports.noneHint")}</p></Empty> : (
          <div className="reports-split">
            <ul className="reports-list">
              {reports.map((row) => (
                <li key={row.name}><button className={row.name === selected ? "on" : ""} onClick={() => setSelected(row.name)}>
                  <Icon name={row.format === "json" ? "table" : "file"} size={15} />
                  <span className="meta"><strong>{when(row.modifiedAt, lang)}</strong><span>{row.format.toUpperCase()} · {size(row.bytes)}</span></span>
                </button></li>
              ))}
            </ul>
            <div className="reports-preview">
              {current && (
                <div className="doc-actions">
                  {current.format === "md" && (["pdf", "docx", "md"] as ExportFormat[]).map((format) => <button key={format} className="btn btn-secondary btn-sm" onClick={() => void exportAs(format)} disabled={busy !== null || !preview.data}>{busy === `export-${format}` ? <span className="spinner" /> : <Icon name="download" size={13} />}{format === "pdf" ? "PDF" : format === "docx" ? "Word" : "Markdown"}</button>)}
                  {preview.data && <button className="btn btn-ghost btn-sm" onClick={() => void revealFile(preview.data!.path).catch(() => {})} title={dirOf(preview.data.path)}><Icon name="folder" size={13} />{t("reports.reveal")}</button>}
                </div>
              )}
              <div className="reports-body selectable">
                {preview.loading && !preview.data ? <Skeleton height={200} /> : preview.data ? (current?.format === "json" ? <pre className="wf-code">{preview.data.content}</pre> : <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(preview.data.content, t("common.copy")) }} />) : null}
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="reports-grid">
        <section className="card reports-card">
          <div className="lean-head"><span className="lean-badge"><Icon name="download" size={16} /></span><div><strong>{t("reports.backupTitle")}</strong><div className="subtitle">{t("reports.backupHint")}</div></div></div>
          <div className="wf-actions"><button className="btn btn-primary" onClick={() => void backup()} disabled={busy !== null}>{busy === "backup" ? <span className="spinner" /> : <Icon name="download" size={15} />}{t("reports.backup")}</button></div>
        </section>
        <section className="card reports-card">
          <div className="lean-head"><span className="lean-badge"><Icon name="refresh" size={16} /></span><div><strong>{t("reports.restoreTitle")}</strong><div className="subtitle">{t("reports.restoreHint")}</div></div></div>
          <div className="wf-actions"><button className="btn btn-secondary" onClick={() => void restore()} disabled={busy !== null}>{busy === "restore" ? <span className="spinner" /> : <Icon name="folder" size={15} />}{t("reports.restore")}</button></div>
        </section>
      </div>
    </div>
  )
}

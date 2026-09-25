import { useState } from "react"
import { useApp } from "../lib/app.ts"
import { useT, type MessageKey } from "../lib/i18n.ts"
import { openExternal, pickFile, runJson } from "../lib/bridge.ts"
import { invalidate, useQuery } from "../lib/query.ts"
import { errorText } from "../lib/cli-text.ts"
import { Icon } from "../components/Icon.tsx"
import { Empty, Skeleton } from "../components/Primitives.tsx"
import { MathText } from "../components/MathText.tsx"

interface Hit { searchId: string; index: number; provider: string; title: string; authors: string[]; year: number | null; doi: string | null; arxivId: string | null; url: string | null; abstract: string | null }
interface Source { id: string; type: string; title: string; authors: string[]; year: number | null; venue: string | null; doi: string | null; arxivId: string | null; url: string | null; status: string; localPath: string | null; provider: string | null }
interface Doctor { state: string; providers: Array<{ name: string; reachable: string; detail: string }> }
const sourcesKey = (root: string) => `${root}|sources`

const linkOf = (row: { url: string | null; doi: string | null; arxivId: string | null }) => row.url && /^https:\/\//.test(row.url) ? row.url : row.arxivId ? `https://arxiv.org/abs/${row.arxivId}` : row.doi ? `https://doi.org/${row.doi}` : null
const authors = (list: string[]) => list.length > 3 ? `${list.slice(0, 3).join(", ")} …` : list.join(", ")

/** Finding and keeping sources. Whatever is found here is context, never proof. */
export function Literature() {
  const app = useApp()
  const { t, lang } = useT()
  const root = app.workspace.root
  const sources = useQuery(sourcesKey(root), () => runJson<Source[]>(root, ["source", "list"]))
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<{ query: string; hits: Hit[]; doctor: Doctor | null } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const search = async () => {
    const text = query.trim()
    if (!text) return
    setSearching(true)
    try {
      const out = await runJson<{ hits: Hit[] }>(root, ["literature", "search", text])
      // No results can mean nothing matched or that no service answered; the doctor tells which.
      const doctor = out.hits.length ? null : await runJson<Doctor>(root, ["literature", "doctor", "--probe"], { allowNonZero: true }).catch(() => null)
      setResult({ query: text, hits: out.hits, doctor })
    } catch (error) { app.toast(errorText(error, lang), "error") }
    finally { setSearching(false) }
  }
  const keep = async (hit: Hit) => {
    setBusy(`${hit.searchId}:${hit.index}`)
    try { await runJson(root, ["source", "import", hit.searchId, String(hit.index)]); invalidate(sourcesKey(root)); app.toast(t("lit.kept")) }
    catch (error) { app.toast(errorText(error, lang), "error") } finally { setBusy(null) }
  }
  const addFile = async () => {
    const path = await pickFile(t("lit.addFile"), ["pdf", "tex", "md", "txt", "bib"])
    if (!path) return
    setBusy("file")
    try { await runJson(root, ["source", "add", path]); invalidate(sourcesKey(root)); app.toast(t("lit.added")) }
    catch (error) { app.toast(errorText(error, lang), "error") } finally { setBusy(null) }
  }
  const unreachable = result?.doctor?.state === "UNAVAILABLE"
  const kept = new Set((sources.data ?? []).map((row) => row.title.toLowerCase()))

  return (
    <div className="page-inner">
      <div className="page-head">
        <div><div className="eyebrow eyebrow-name">{app.workspace.name}</div><h1 className="title">{t("lit.title")}</h1><p className="subtitle">{t("lit.subtitle")}</p></div>
      </div>
      <form className="lit-search" onSubmit={(event) => { event.preventDefault(); void search() }}>
        <Icon name="search" size={17} />
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("lit.placeholder")} aria-label={t("lit.placeholder")} />
        <button className="btn btn-primary" type="submit" disabled={searching || !query.trim()}>{searching ? <span className="spinner" /> : t("lit.search")}</button>
      </form>
      <p className="field-hint lit-note"><Icon name="info" size={13} /> {t("lit.trust")}</p>

      {searching && <div className="lit-results"><Skeleton height={96} /><Skeleton height={96} /></div>}
      {!searching && result && (
        <section className="lit-results">
          <div className="section-title">{t("lit.resultsFor").replace("{query}", result.query)}</div>
          {unreachable && (
            <div className="wf-notice no" role="alert"><Icon name="info" size={15} /><div><strong>{t("lit.unreachable")}</strong><div>{t("lit.unreachableHint").replace("{providers}", result.doctor!.providers.map((row) => row.name).join(", "))}</div></div></div>
          )}
          {!result.hits.length && !unreachable && <Empty glyph="∅" title={t("lit.none")} />}
          {result.hits.map((hit) => {
            const key = `${hit.searchId}:${hit.index}`, link = linkOf(hit)
            return (
              <article key={key} className="card lit-hit">
                <div className="lit-hit-head">
                  <h3>{hit.title}</h3>
                  <span className="pill pill-soft">{hit.provider}</span>
                </div>
                <div className="lit-meta">{authors(hit.authors)}{hit.year ? ` · ${hit.year}` : ""}{hit.arxivId ? ` · arXiv:${hit.arxivId}` : hit.doi ? ` · doi:${hit.doi}` : ""}</div>
                {hit.abstract && <div className={`lit-abstract ${open === key ? "open" : ""}`} onClick={() => setOpen(open === key ? null : key)}><MathText text={hit.abstract} /></div>}
                <div className="wf-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => void keep(hit)} disabled={busy !== null || kept.has(hit.title.toLowerCase())}>{busy === key ? <span className="spinner" /> : <Icon name={kept.has(hit.title.toLowerCase()) ? "check" : "plus"} size={14} />}{kept.has(hit.title.toLowerCase()) ? t("lit.inSources") : t("lit.keep")}</button>
                  {link && <button className="btn btn-ghost btn-sm" onClick={() => void openExternal(link)}><Icon name="globe" size={14} />{t("lit.open")}</button>}
                </div>
              </article>
            )
          })}
        </section>
      )}

      <section className="lit-sources">
        <div className="reports-head">
          <div><h2 className="section-h">{t("lit.sources")}</h2><p className="field-hint">{t("lit.sourcesHint")}</p></div>
          <button className="btn btn-secondary" onClick={() => void addFile()} disabled={busy !== null}>{busy === "file" ? <span className="spinner" /> : <Icon name="paperclip" size={15} />}{t("lit.addFile")}</button>
        </div>
        {!sources.data ? <Skeleton height={80} /> : !sources.data.length ? <Empty glyph="∅" title={t("lit.noSources")}><p className="field-hint">{t("lit.noSourcesHint")}</p></Empty> : (
          <div className="card lit-table">
            {sources.data.map((row) => {
              const link = linkOf(row)
              return (
                <div key={row.id} className="lit-row">
                  <span className="kbd">{row.id}</span>
                  <div className="lit-row-main"><strong>{row.title}</strong><span>{authors(row.authors)}{row.year ? ` · ${row.year}` : ""}{row.venue ? ` · ${row.venue}` : ""}{row.localPath ? ` · ${t("lit.localFile")}` : ""}</span></div>
                  <span className="pill pill-dashed">{t(`lit.status.${row.status}` as MessageKey) ?? row.status}</span>
                  {link && <button className="btn btn-ghost btn-icon" onClick={() => void openExternal(link)} aria-label={t("lit.open")} title={t("lit.open")}><Icon name="globe" size={15} /></button>}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

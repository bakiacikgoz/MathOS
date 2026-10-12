import { useState } from "react"
import { useApp } from "../lib/app.ts"
import { useClaims } from "../lib/data.ts"
import { run } from "../lib/bridge.ts"
import { invalidate } from "../lib/query.ts"
import { useT } from "../lib/i18n.ts"
import { errorText } from "../lib/cli-text.ts"
import { CONVENTION_KINDS, MEMORY_KINDS, memoryBasisLabel, memoryKeys, memoryKindLabel, useConventions, useFailures, useLibrary, useMemoryNotes, useProfile, type MemoryKind, type MemoryNote } from "../lib/memory.ts"
import { Icon } from "../components/Icon.tsx"
import { Empty, ErrorBox, Skeleton } from "../components/Primitives.tsx"
import { MathText } from "../components/MathText.tsx"

/**
 * What MathOS remembers for this research and for you: notes, conventions, failed proofs, and your preferences and
 * verified results across workspaces. Everything here is a record you can read, change and delete; none of it is proof.
 */
export function Memory() {
  const app = useApp()
  const { t, lang } = useT()
  const root = app.workspace.root
  const notes = useMemoryNotes(root), conventions = useConventions(root), failures = useFailures(root), profile = useProfile(root), library = useLibrary(root), claims = useClaims(root)
  const [busy, setBusy] = useState<string | null>(null)
  const [kind, setKind] = useState<MemoryKind>("DECISION")
  const [text, setText] = useState("")
  const [claim, setClaim] = useState("")
  const [scope, setScope] = useState<"branch" | "workspace">("branch")
  const [filter, setFilter] = useState<MemoryKind | "ALL">("ALL")
  const [showArchived, setShowArchived] = useState(false)
  const [refuting, setRefuting] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [convention, setConvention] = useState<{ kind: string; name: string; value: string }>({ kind: "CONVENTION", name: "", value: "" })
  const [preference, setPreference] = useState("")
  const [libraryClaim, setLibraryClaim] = useState("")

  const act = async (key: string, args: string[], message: string) => {
    setBusy(key)
    // The memory keys share one prefix, so this refreshes notes, conventions, failures, preferences and the library.
    try { await run(root, args); invalidate(memoryKeys.notes(root)); app.toast(message); return true }
    catch (error) { app.toast(errorText(error, lang), "error"); return false } finally { setBusy(null) }
  }
  const addNote = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!text.trim()) return
    if (await act("add", ["memory", "add", "--kind", kind, "--text", text.trim(), "--scope", scope, ...(claim ? ["--claim", claim] : [])], t("memory.added"))) { setText(""); setClaim("") }
  }
  const addConvention = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!convention.name.trim() || !convention.value.trim()) return
    if (await act("convention", ["context", "propose", "--kind", convention.kind, "--name", convention.name.trim(), "--value", convention.value.trim(), "--scope", "workspace", "--apply"], t("memory.conventionAdded"))) setConvention({ ...convention, name: "", value: "" })
  }
  const addPreference = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!preference.trim()) return
    if (await act("preference", ["profile", "add", preference.trim()], t("memory.preferenceAdded"))) setPreference("")
  }

  const all = notes.data ?? []
  const pending = all.filter((note) => note.status === "PROPOSED")
  const shown = all.filter((note) => (showArchived ? note.status === "ARCHIVED" : note.status === "ACTIVE") && (filter === "ALL" || note.kind === filter))
  const activeConventions = (conventions.data ?? []).filter((item) => item.status === "ACTIVE")
  const pendingConventions = (conventions.data ?? []).filter((item) => item.status === "PROPOSED")
  const verified = (claims.data ?? []).filter((row) => row.status === "KERNEL_VERIFIED")

  const noteRow = (note: MemoryNote) => (
    <div key={note.id} className="memory-row">
      <div className="memory-row-head">
        <span className="kbd">{note.id}</span>
        <span className="pill pill-soft">{memoryKindLabel(note.kind, lang)}</span>
        <span className={`pill ${note.basis === "REFUTED" ? "pill-strike" : note.basis === "LEAN" && note.claimVerified ? "pill-solid" : "pill-dashed"}`}>{memoryBasisLabel(note, lang)}</span>
        {note.claimId && <span className="pill pill-outline">{note.claimId}</span>}
        <span className="memory-scope">{note.scopeKind === "WORKSPACE" ? t("memory.scope.workspace") : t("memory.scope.branch")}</span>
      </div>
      <div className={`memory-text ${note.basis === "REFUTED" ? "refuted" : ""}`}><MathText text={note.text} /></div>
      {note.reason && <div className="field-hint">{note.basis === "REFUTED" ? t("memory.refutedBecause") : t("memory.reason")}: {note.reason}</div>}
      {refuting === note.id ? (
        <form className="inline-form" onSubmit={async (event) => { event.preventDefault(); if (reason.trim() && await act(note.id, ["memory", "refute", note.id, "--reason", reason.trim()], t("memory.refuted"))) { setRefuting(null); setReason("") } }}>
          <input className="input" autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("memory.refutePlaceholder")} />
          <button className="btn btn-primary btn-sm" disabled={!reason.trim() || busy !== null}>{t("memory.refute")}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRefuting(null)}>{t("memory.cancel")}</button>
        </form>
      ) : (
        <div className="wf-actions">
          {note.status === "PROPOSED" && <>
            <button className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => void act(note.id, ["memory", "accept", note.id], t("memory.kept"))}><Icon name="check" size={14} />{t("memory.keep")}</button>
            <button className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void act(note.id, ["memory", "reject", note.id], t("memory.rejected"))}><Icon name="x" size={14} />{t("memory.reject")}</button>
          </>}
          {note.status === "ACTIVE" && <>
            {note.basis !== "REFUTED" && <button className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => { setRefuting(note.id); setReason("") }}>{t("memory.refute")}</button>}
            <button className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void act(note.id, ["memory", "archive", note.id], t("memory.archived"))}><Icon name="trash" size={14} />{t("memory.archive")}</button>
          </>}
          {note.status === "ARCHIVED" && <button className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void act(note.id, ["memory", "restore", note.id], t("memory.restored"))}><Icon name="refresh" size={14} />{t("memory.restore")}</button>}
        </div>
      )}
    </div>
  )

  return (
    <div className="page-inner">
      <div className="page-head">
        <div><div className="eyebrow eyebrow-name">{app.workspace.name}</div><h1 className="title">{t("nav.memory")}</h1><p className="subtitle">{t("memory.subtitle")}</p></div>
      </div>
      <p className="field-hint lit-note"><Icon name="info" size={13} /> {t("memory.trust")}</p>
      {notes.error ? <ErrorBox error={notes.error} onRetry={() => notes.refetch()} /> : null}

      {(pending.length > 0 || pendingConventions.length > 0) && (
        <section className="memory-section">
          <div className="section-title">{t("memory.pending")}</div>
          <div className="card memory-list">
            {pending.map(noteRow)}
            {pendingConventions.map((item) => (
              <div key={item.id} className="memory-row">
                <div className="memory-row-head"><span className="pill pill-soft">{item.kind}</span><strong>{item.canonicalName}</strong></div>
                <div className="memory-text"><MathText text={item.displayText} /></div>
                <div className="wf-actions">
                  <button className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => void act(item.id, ["context", "apply", item.id], t("memory.conventionAdded"))}><Icon name="check" size={14} />{t("memory.apply")}</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void act(item.id, ["context", "reject", item.id], t("memory.rejected"))}><Icon name="x" size={14} />{t("memory.reject")}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="memory-section">
        <div className="reports-head">
          <div><h2 className="section-h">{t("memory.notes")}</h2><p className="field-hint">{t("memory.notesHint")}</p></div>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowArchived((value) => !value)}>{showArchived ? t("memory.showActive") : t("memory.showArchived")}</button>
        </div>
        <div className="memory-filters">
          {(["ALL", ...MEMORY_KINDS] as const).map((value) => <button key={value} className={`chip ${filter === value ? "active" : ""}`} onClick={() => setFilter(value)}>{value === "ALL" ? t("memory.all") : memoryKindLabel(value, lang)}</button>)}
        </div>
        {!notes.data && !notes.error ? <Skeleton height={80} /> : !shown.length ? <Empty glyph="∅" title={showArchived ? t("memory.noArchived") : t("memory.empty")}><p className="field-hint">{t("memory.emptyHint")}</p></Empty> : <div className="card memory-list">{shown.map(noteRow)}</div>}
        <form className="memory-form card" onSubmit={addNote}>
          <div className="memory-form-row">
            <select className="input" value={kind} onChange={(event) => setKind(event.target.value as MemoryKind)} aria-label={t("memory.kind")}>{MEMORY_KINDS.map((value) => <option key={value} value={value}>{memoryKindLabel(value, lang)}</option>)}</select>
            <select className="input" value={claim} onChange={(event) => setClaim(event.target.value)} aria-label={t("memory.claim")}><option value="">{t("memory.noClaim")}</option>{(claims.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.id} · {row.title}</option>)}</select>
            <select className="input" value={scope} onChange={(event) => setScope(event.target.value as "branch" | "workspace")} aria-label={t("memory.scope")}><option value="branch">{t("memory.scope.branch")}</option><option value="workspace">{t("memory.scope.workspace")}</option></select>
          </div>
          <textarea className="textarea" value={text} onChange={(event) => setText(event.target.value)} placeholder={t("memory.placeholder")} maxLength={2000} />
          <div className="wf-actions"><button className="btn btn-primary" disabled={!text.trim() || busy !== null}>{busy === "add" ? <span className="spinner" /> : <Icon name="plus" size={16} />}{t("memory.add")}</button></div>
        </form>
      </section>

      <section className="memory-section">
        <div className="section-title">{t("memory.conventions")}</div>
        <p className="field-hint">{t("memory.conventionsHint")}</p>
        {activeConventions.length > 0 && <div className="card lit-table">{activeConventions.map((item) => (
          <div key={item.id} className="lit-row"><span className="pill pill-soft">{item.kind}</span><div className="lit-row-main"><strong>{item.canonicalName}</strong><span><MathText text={item.displayText} /></span></div><span className="memory-scope">{item.scopeKind === "WORKSPACE" ? t("memory.scope.workspace") : item.scopeKind === "CLAIM" ? item.scopeId : t("memory.scope.branch")}</span></div>
        ))}</div>}
        <form className="inline-form" onSubmit={addConvention}>
          <select className="input" style={{ maxWidth: 190 }} value={convention.kind} onChange={(event) => setConvention({ ...convention, kind: event.target.value })} aria-label={t("memory.kind")}>{CONVENTION_KINDS.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <input className="input" style={{ maxWidth: 200 }} value={convention.name} onChange={(event) => setConvention({ ...convention, name: event.target.value })} placeholder={t("memory.conventionName")} />
          <input className="input" value={convention.value} onChange={(event) => setConvention({ ...convention, value: event.target.value })} placeholder={t("memory.conventionValue")} />
          <button className="btn btn-secondary" disabled={!convention.name.trim() || !convention.value.trim() || busy !== null}><Icon name="plus" size={16} />{t("memory.add")}</button>
        </form>
      </section>

      <section className="memory-section">
        <div className="section-title">{t("memory.failures")}</div>
        <p className="field-hint">{t("memory.failuresHint")}</p>
        {failures.data && failures.data.length > 0 && <div className="card memory-list">{failures.data.slice(0, 20).map((row) => (
          <details key={row.id} className="memory-row">
            <summary className="memory-row-head"><span className="kbd">{row.id}</span><span className="pill pill-dashed">{row.failureClass}</span><span className="memory-scope">{t("memory.failedTimes").replace("{n}", String(row.occurrenceCount))}</span></summary>
            <pre className="wf-code">{row.attemptedApproach}</pre>
            <div className="field-hint">Lean: {row.normalizedDiagnostic.split("\n")[0]}</div>
          </details>
        ))}</div>}
        {failures.data && failures.data.length === 0 && <p className="field-hint">{t("memory.noFailures")}</p>}
      </section>

      <section className="memory-section">
        <div className="reports-head">
          <div><h2 className="section-h">{t("memory.personal")}</h2><p className="field-hint">{t("memory.personalHint")}</p></div>
        </div>
        <div className="section-title">{t("memory.preferences")}</div>
        {profile.error ? <ErrorBox error={profile.error} onRetry={() => profile.refetch()} /> : null}
        {profile.data && profile.data.preferences.length > 0 && <div className="card lit-table">{profile.data.preferences.map((item) => (
          <div key={item.id} className="lit-row"><span className="kbd">{item.id}</span><div className="lit-row-main"><span>{item.text}</span></div><button className="btn btn-ghost btn-icon" disabled={busy !== null} aria-label={t("memory.remove")} title={t("memory.remove")} onClick={() => void act(item.id, ["profile", "remove", item.id], t("memory.removed"))}><Icon name="trash" size={15} /></button></div>
        ))}</div>}
        <form className="inline-form" onSubmit={(event) => void addPreference(event)}>
          <input className="input" value={preference} onChange={(event) => setPreference(event.target.value)} placeholder={t("memory.preferencePlaceholder")} maxLength={500} />
          <button className="btn btn-secondary" disabled={!preference.trim() || busy !== null}><Icon name="plus" size={16} />{t("memory.add")}</button>
        </form>

        <div className="section-title">{t("memory.library")}</div>
        <p className="field-hint">{t("memory.libraryHint")}</p>
        {library.data && library.data.length > 0 && <div className="card lit-table">{library.data.map((entry) => (
          <div key={entry.id} className="lit-row"><span className="kbd">{entry.id}</span><div className="lit-row-main"><strong>{entry.title || entry.name}</strong><span>{entry.name} · {entry.source.workspace} / {entry.source.claimId}</span></div><button className="btn btn-ghost btn-icon" disabled={busy !== null} aria-label={t("memory.remove")} title={t("memory.remove")} onClick={() => void act(entry.id, ["library", "remove", entry.id], t("memory.removed"))}><Icon name="trash" size={15} /></button></div>
        ))}</div>}
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (libraryClaim) void act("library", ["library", "add", libraryClaim], t("memory.libraryAdded")).then((ok) => { if (ok) setLibraryClaim("") }) }}>
          <select className="input" value={libraryClaim} onChange={(event) => setLibraryClaim(event.target.value)} aria-label={t("memory.libraryAdd")} disabled={!verified.length}>
            <option value="">{verified.length ? t("memory.libraryPick") : t("memory.libraryNoVerified")}</option>
            {verified.map((row) => <option key={row.id} value={row.id}>{row.id} · {row.title}</option>)}
          </select>
          <button className="btn btn-secondary" disabled={!libraryClaim || busy !== null}><Icon name="plus" size={16} />{t("memory.libraryAdd")}</button>
        </form>
        {profile.data && <p className="field-hint">{t("memory.personalPath")}: <code>{profile.data.path}</code></p>}
      </section>
    </div>
  )
}

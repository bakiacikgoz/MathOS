import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { useApp, type Claim } from "../lib/app.ts"
import { keys, useClaimPage, useClaims, useStatus } from "../lib/data.ts"
import { run } from "../lib/bridge.ts"
import { invalidate } from "../lib/query.ts"
import { useT, type Lang, type MessageKey } from "../lib/i18n.ts"
import { isVerifiedStatus, kindLabel, statusMeta } from "../lib/status.ts"
import { parseClaimPage } from "../lib/claim-page.ts"
import { Icon } from "../components/Icon.tsx"
import { Empty, ErrorBox, Segmented, Skeleton, StatusPill } from "../components/Primitives.tsx"
import { HelpButton, useAutoTour } from "../components/Tour.tsx"
import { MathText } from "../components/MathText.tsx"

type Filter = "all" | "open" | "verified" | "blocked"
const isOpen = (status: string) => !isVerifiedStatus(status) && !["disproved", "blocked", "stale"].includes(status.toLowerCase())

export function Claims() {
  const app = useApp()
  const { t } = useT()
  const claims = useClaims(app.workspace.root)
  const status = useStatus(app.workspace.root)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const deferred = useDeferredValue(query)
  const objectiveId = status.data?.status.mainObjective?.id

  const rows = useMemo(() => {
    const q = deferred.trim().toLowerCase()
    return (claims.data ?? []).filter((claim) => {
      if (filter === "open" && !isOpen(claim.status)) return false
      if (filter === "verified" && !isVerifiedStatus(claim.status)) return false
      if (filter === "blocked" && claim.status.toLowerCase() !== "blocked") return false
      return !q || claim.id.toLowerCase().includes(q) || claim.title.toLowerCase().includes(q) || claim.naturalStatement.toLowerCase().includes(q)
    })
  }, [claims.data, deferred, filter])

  useEffect(() => {
    if (!app.selectedClaim && rows[0]) app.selectClaim(rows[0].id)
  }, [rows, app])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    const index = rows.findIndex((row) => row.id === app.selectedClaim)
    const next = rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]
    if (next) { app.selectClaim(next.id); document.getElementById(`claim-${next.id}`)?.scrollIntoView({ block: "nearest" }) }
  }

  useAutoTour("claims", Boolean(claims.data), "app")
  return (
    <div className="split">
      <div className="list-pane" onKeyDown={onKeyDown}>
        <div className="list-head">
          <div className="row">
            <h1>{t("nav.claims")}</h1>
            <span className="head-actions"><HelpButton tour="claims" /><button className="btn btn-primary btn-icon" data-tour="claims-new" onClick={app.newClaim} aria-label={t("claimForm.title")} title={t("claimForm.title")}><Icon name="plus" size={16} /></button></span>
          </div>
          <div className="search-wrap"><Icon name="search" size={15} /><input className="input input-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("claims.search")} spellCheck={false} /></div>
          <div data-tour="claims-filter"><Segmented value={filter} onChange={setFilter} options={[
            { value: "all", label: t("claims.all") }, { value: "open", label: t("claims.open") },
            { value: "verified", label: t("claims.verified") }, { value: "blocked", label: t("claims.blocked") },
          ]} /></div>
        </div>
        <div className="list-scroll" data-tour="claims-list" role="listbox" aria-label={t("nav.claims")} tabIndex={0}>
          {claims.error ? <ErrorBox error={claims.error} onRetry={() => claims.refetch()} /> : null}
          {!claims.data && !claims.error && Array.from({ length: 5 }, (_, index) => <div key={index} style={{ padding: 12 }}><Skeleton height={12} width="30%" /><Skeleton height={16} width="80%" style={{ marginTop: 8 }} /></div>)}
          {claims.data && claims.data.length === 0 && <Empty glyph="∃" title={t("claims.empty")}><p>{t("claims.emptyHint")}</p><button className="btn btn-primary" onClick={app.newClaim}><Icon name="plus" size={16} />{t("claimForm.title")}</button></Empty>}
          {claims.data && claims.data.length > 0 && rows.length === 0 && <Empty glyph="?" title={t("claims.noMatch")} />}
          <div className="stagger">
            {rows.map((claim, index) => (
              <ClaimRow key={claim.id} claim={claim} index={index} selected={claim.id === app.selectedClaim} objective={claim.id === objectiveId} onSelect={() => app.selectClaim(claim.id)} />
            ))}
          </div>
        </div>
      </div>
      <div className="detail-pane">
        {app.selectedClaim ? <ClaimDetail key={app.selectedClaim} id={app.selectedClaim} objective={app.selectedClaim === objectiveId} /> : <Empty glyph="∀" title={t("claims.select")} />}
      </div>
    </div>
  )
}

function ClaimRow({ claim, index, selected, objective, onSelect }: { claim: Claim; index: number; selected: boolean; objective: boolean; onSelect: () => void }) {
  const { lang } = useT()
  return (
    <button id={`claim-${claim.id}`} role="option" aria-selected={selected} className={`claim-row ${selected ? "selected" : ""}`} style={{ "--i": index } as React.CSSProperties} onClick={onSelect}>
      <div className="top"><span className="id">{claim.id}</span><StatusPill status={claim.status} />{objective && <span className="star" title="★"><Icon name="target" size={14} /></span>}</div>
      <div className="t">{claim.title}</div>
      <div className="muted">{kindLabel(claim.kind, lang)} · <MathText text={claim.naturalStatement} inline /></div>
    </button>
  )
}

const LABELS: Record<string, { tr: string; en: string }> = {
  Status: { tr: "Durum", en: "Status" },
  Origin: { tr: "Köken", en: "Origin" },
  "Formal statement": { tr: "Biçimsel ifade", en: "Formal statement" },
  Fidelity: { tr: "Sadakat incelemesi", en: "Fidelity" },
  Dependencies: { tr: "Bağımlılıklar", en: "Dependencies" },
  "Proof attempts": { tr: "Kanıt denemeleri", en: "Proof attempts" },
  "Last failure": { tr: "Son başarısızlık", en: "Last failure" },
  Verification: { tr: "Doğrulama", en: "Verification" },
  Evidence: { tr: "Kanıt dışı destek", en: "Evidence" },
  Formalization: { tr: "Biçimselleştirme", en: "Formalization" },
  "Proof attempt": { tr: "Kanıt denemesi", en: "Proof attempt" },
  "Open blocker": { tr: "Açık engel", en: "Open blocker" },
  VerificationGate: { tr: "VerificationGate", en: "VerificationGate" },
  "Current status": { tr: "Mevcut durum", en: "Current status" },
}
const label = (text: string, lang: Lang) => LABELS[text]?.[lang] ?? text

function ClaimDetail({ id, objective }: { id: string; objective: boolean }) {
  const app = useApp()
  const { t, lang } = useT()
  const detail = useClaimPage(app.workspace.root, id)
  const [busy, setBusy] = useState(false)
  const page = useMemo(() => detail.data ? parseClaimPage(detail.data.page) : null, [detail.data])
  const claim = detail.data?.claim

  if (detail.error) return <ErrorBox error={detail.error} onRetry={() => detail.refetch()} />
  if (!claim || !page) return <div><Skeleton height={14} width={120} /><Skeleton height={34} width="70%" style={{ marginTop: 16 }} /><Skeleton height={140} style={{ marginTop: 24, borderRadius: 18 }} /></div>

  const makeObjective = async () => {
    setBusy(true)
    try { await run(app.workspace.root, ["objective", "set", id]); invalidate(keys.status(app.workspace.root)); app.toast(t("claims.objectiveSet")) }
    catch (error) { app.toast((error as Error).message, "error") } finally { setBusy(false) }
  }
  const facts = page.sections.filter((section) => section.label !== "Statement" && section.label !== "Status")

  return (
    <div className="view-enter">
      <div className="detail-head">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="kbd">{claim.id}</span>
          {kindLabel(claim.kind, lang) !== statusMeta(claim.status, lang).label && <span className="pill pill-muted">{kindLabel(claim.kind, lang)}</span>}
          <StatusPill status={claim.status} />
        </div>
        <div style={{ display: "flex", gap: 8, flex: "none" }}>
          <button className="btn btn-ghost btn-icon" title={t("claims.copyId")} aria-label={t("claims.copyId")} onClick={() => { void navigator.clipboard?.writeText(claim.id); app.toast(`${t("claims.copied")} · ${claim.id}`) }}><Icon name="copy" size={16} /></button>
          {objective ? <span className="pill pill-solid" style={{ height: 32, padding: "0 14px" }}><Icon name="target" size={14} />{t("claims.isObjective")}</span>
            : <button className="btn btn-secondary" onClick={makeObjective} disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="target" size={16} />}{t("claims.makeObjective")}</button>}
        </div>
      </div>
      <h1 className="detail-title selectable">{claim.title}</h1>
      <p className="subtitle">{statusMeta(claim.status, lang).hint}</p>

      <div className="card statement-card selectable"><MathText text={claim.naturalStatement} /></div>

      {page.checks.length > 0 && <>
        <div className="section-title">{t("claims.whyNot")}</div>
        <div data-tour="claims-why" className="card card-pad checklist stagger" style={{ paddingTop: 6, paddingBottom: 6 }}>
          {page.checks.map((check, index) => (
            <div key={check.label} className="check-row" style={{ "--i": index } as React.CSSProperties}>
              <span className={`mark ${check.ok === true ? "ok" : check.ok === false ? "no" : "info"}`}><Icon name={check.ok === true ? "check" : check.ok === false ? "x" : "info"} size={12} stroke={2.4} /></span>
              <span>{label(check.label, lang)}</span>
              {check.value && <span className="v">{check.label === "Current status" ? statusMeta(check.value, lang).label : cliValue(check.value, t)}</span>}
            </div>
          ))}
        </div>
      </>}

      {facts.length > 0 && <>
        <div className="section-title">{t("claims.details")}</div>
        <div className="facts stagger">
          {facts.map((section, index) => (
            <div key={section.label} className="card fact" style={{ "--i": index } as React.CSSProperties}>
              <div className="k">{label(section.label, lang)}</div>
              <div className="v selectable">{section.lines.map((line) => cliValue(line, t)).join("\n") || "—"}</div>
            </div>
          ))}
        </div>
      </>}
      {page.notes.length > 0 && <p className="disclaimer">{page.notes.join(" ")}</p>}
    </div>
  )
}

// The CLI prints a few fixed English placeholders for empty values; show them in the UI language.
function cliValue(value: string, t: (key: MessageKey) => string) { const key = value.trim().toLowerCase(); return key === "none" ? t("common.none") : key === "not created" ? t("common.notCreated") : value }

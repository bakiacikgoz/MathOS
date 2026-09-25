import { useApp } from "../lib/app.ts"
import { useDoctor } from "../lib/data.ts"
import { useT } from "../lib/i18n.ts"
import { Icon } from "../components/Icon.tsx"
import { HelpButton, useAutoTour } from "../components/Tour.tsx"
import { checkDetail, checkName } from "../lib/cli-text.ts"
import { ErrorBox, Skeleton } from "../components/Primitives.tsx"
import { LeanSetup } from "../components/LeanSetup.tsx"

export function Health() {
  const app = useApp()
  const { t, lang } = useT()
  const doctor = useDoctor(app.workspace.root)
  const checks = doctor.data?.checks ?? []
  const pass = checks.filter((check) => check.status === "PASS").length
  const failed = checks.some((check) => check.status === "FAIL")
  // The headline must not read "all good" while warnings are listed below it.
  const headline = failed || doctor.data?.ok === false ? "health.issues" : pass < checks.length ? "health.warnings" : "health.ok"
  const ratio = checks.length ? pass / checks.length : 0
  const circumference = 2 * Math.PI * 26
  useAutoTour("health", Boolean(doctor.data), "app")

  return (
    <div className="page-inner">
      <div className="page-head">
        <div><div className="eyebrow eyebrow-name">{app.workspace.name}</div><h1 className="title">{t("health.title")}</h1></div>
        <div className="head-actions">
        <button className="btn btn-secondary" onClick={() => doctor.refetch()} disabled={doctor.loading}>{doctor.loading ? <span className="spinner" /> : <Icon name="refresh" size={16} />}{t("health.run")}</button>
        <HelpButton tour="health" />
        </div>
      </div>
      {doctor.error ? <ErrorBox error={doctor.error} onRetry={() => doctor.refetch()} /> : null}
      <div style={{ marginBottom: 14 }}><LeanSetup onReady={() => void doctor.refetch()} /></div>
      <div className="card health-hero view-enter" data-tour="health-hero">
        <svg className="health-ring" viewBox="0 0 64 64" aria-hidden>
          <circle cx="32" cy="32" r="26" fill="none" stroke="var(--fill-2)" strokeWidth="6" />
          <circle cx="32" cy="32" r="26" fill="none" stroke="var(--ink)" strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio)} transform="rotate(-90 32 32)" />
        </svg>
        <div>
          {doctor.data ? <>
            <div style={{ font: "600 22px/1.2 var(--font-display)", letterSpacing: "-0.02em" }}>{t(headline)}</div>
            <div className="subtitle" style={{ marginTop: 4 }}>{pass} / {checks.length} {t("health.pass").toLowerCase()}{doctor.data.mathosVersion ? ` · MathOS ${doctor.data.mathosVersion}` : ""}</div>
          </> : <><Skeleton height={22} width={220} /><Skeleton height={14} width={140} style={{ marginTop: 8 }} /></>}
        </div>
      </div>
      <div className="card health-list stagger" data-tour="health-list" style={{ marginTop: 14, overflow: "hidden" }}>
        {!doctor.data && !doctor.error && Array.from({ length: 6 }, (_, index) => <div key={index} className="row"><Skeleton height={16} width={16} /><Skeleton height={14} /><Skeleton height={14} /><span /></div>)}
        {checks.map((check, index) => (
          <div key={check.name} className="row" style={{ "--i": index } as React.CSSProperties}>
            <span className={`check-row`} style={{ padding: 0, border: 0 }}>
              <span className={`mark ${check.status === "PASS" ? "ok" : check.status === "FAIL" ? "no" : "info"}`}><Icon name={check.status === "PASS" ? "check" : check.status === "FAIL" ? "x" : "info"} size={12} stroke={2.4} /></span>
            </span>
            <span className="name">{checkName(check.name, lang)}</span>
            <span className="detail selectable" title={check.detail}>{checkDetail(check.detail, lang)}</span>
            <span className={`pill ${check.status === "PASS" ? "pill-soft" : check.status === "FAIL" ? "pill-solid" : "pill-dashed"}`}>{t(check.status === "PASS" ? "health.pass" : check.status === "FAIL" ? "health.fail" : "health.warn")}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

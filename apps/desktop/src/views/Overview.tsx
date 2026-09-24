import { useApp } from "../lib/app.ts"
import { useClaims, useStatus } from "../lib/data.ts"
import { useT } from "../lib/i18n.ts"
import { Icon } from "../components/Icon.tsx"
import { CountUp, ErrorBox, Skeleton, StatusPill } from "../components/Primitives.tsx"
import { MathText } from "../components/MathText.tsx"

export function Overview() {
  const app = useApp()
  const { t } = useT()
  const status = useStatus(app.workspace.root)
  const claims = useClaims(app.workspace.root)
  const s = status.data?.status
  const objective = s?.mainObjective ? claims.data?.find((claim) => claim.id === s.mainObjective!.id) : undefined
  const total = s?.research.totalClaims ?? 0
  const pct = (value: number) => total ? `${Math.round((value / total) * 100)}%` : "0%"
  const hour = new Date().getHours()

  return (
    <div className="page-inner">
      <div className="page-head">
        <div>
          <div className="eyebrow">{app.workspace.name}</div>
          <h1 className="title">{t("nav.overview")}</h1>
        </div>
        <button className="btn btn-ghost" onClick={() => { void status.refetch(); void claims.refetch() }} aria-label={t("common.refresh")}>
          {status.refreshing ? <span className="spinner" /> : <Icon name="refresh" size={16} />}
        </button>
      </div>

      {status.error ? <ErrorBox error={status.error} onRetry={() => status.refetch()} /> : null}

      <div className="stagger">
        <section className="card hero-objective" style={{ "--i": 0 } as React.CSSProperties}>
          <span className="glyph-bg" aria-hidden>{hour < 12 ? "∂" : hour < 18 ? "∑" : "∞"}</span>
          <div className="row"><Icon name="target" size={16} /><span className="eyebrow" style={{ margin: 0 }}>{t("overview.objective")}</span></div>
          {!s ? (
            <><Skeleton height={28} width="60%" style={{ margin: "14px 0 10px" }} /><Skeleton height={16} width="80%" /></>
          ) : s.mainObjective ? (
            <>
              <h2 className="claim-title">{s.mainObjective.title}</h2>
              {objective && <p className="statement"><MathText text={objective.naturalStatement} /></p>}
              <div className="row" style={{ marginTop: 16 }}>
                <StatusPill status={s.mainObjective.status} />
                <span className="kbd">{s.mainObjective.id}</span>
                <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => { app.selectClaim(s.mainObjective!.id); app.navigate("claims") }}>
                  {t("claims.details")} <Icon name="arrow" size={14} />
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="claim-title">{t("overview.noObjective")}</h2>
              <p className="statement">{t("overview.noObjectiveHint")}</p>
              <div className="quick"><button className="btn btn-primary" onClick={app.newClaim}><Icon name="plus" size={16} />{t("overview.newClaim")}</button></div>
            </>
          )}
        </section>

        <div className="stats">
          {([
            ["overview.claims", s?.research.totalClaims, null],
            ["overview.verified", s?.research.verified, s ? pct(s.research.verified) : null],
            ["overview.conjectures", s?.research.conjectures, s ? pct(s.research.conjectures) : null],
            ["overview.blocked", s?.research.blocked, s ? pct(s.research.blocked) : null],
          ] as const).map(([label, value, bar], index) => (
            <div key={label} className="card stat" style={{ "--i": index + 1 } as React.CSSProperties}>
              <div className="value">{value === undefined ? <Skeleton height={34} width={48} /> : <CountUp value={value} />}</div>
              <div className="label">{t(label)}</div>
              {bar !== null && <div className="bar"><i style={{ width: bar }} /></div>}
            </div>
          ))}
        </div>

        <div className="grid-2">
          <section className="card card-pad" style={{ "--i": 5 } as React.CSSProperties}>
            <div className="eyebrow">{t("overview.branch")}</div>
            {s?.branch ? (
              <div className="kv" style={{ borderBottom: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 17 }}>{s.branch.name}</span>
                <button className="btn btn-secondary" onClick={() => app.navigate("branches")}><Icon name="branch" size={16} />{s.branch.id}</button>
              </div>
            ) : <Skeleton height={22} width="50%" style={{ marginTop: 10 }} />}
          </section>
          <section className="card card-pad" style={{ "--i": 6 } as React.CSSProperties}>
            <div className="eyebrow">{t("overview.integrity")}</div>
            <div className="kv"><span className="k">{t("overview.database")}</span><Check ok={s ? s.integrity.database === "connected" : null} /></div>
            <div className="kv"><span className="k">{t("overview.eventLog")}</span><Check ok={s ? s.integrity.eventLog === "ok" : null} /></div>
          </section>
        </div>

        <div className="quick" style={{ "--i": 7 } as React.CSSProperties}>
          <button className="btn btn-primary" onClick={app.newClaim}><Icon name="plus" size={16} />{t("overview.newClaim")}</button>
          <button className="btn btn-secondary" onClick={() => app.navigate("claims")}><Icon name="claims" size={16} />{t("overview.viewClaims")}</button>
          <button className="btn btn-secondary" onClick={() => app.navigate("health")}><Icon name="health" size={16} />{t("overview.checkHealth")}</button>
        </div>

        <div className="note" style={{ "--i": 8 } as React.CSSProperties}><Icon name="info" size={16} /><span>{t("overview.trust")}</span></div>
      </div>
    </div>
  )
}

function Check({ ok }: { ok: boolean | null }) {
  if (ok === null) return <Skeleton height={16} width={40} />
  return <span className={`pill ${ok ? "pill-solid" : "pill-dashed"}`}><Icon name={ok ? "check" : "x"} size={12} stroke={2.4} />{ok ? "OK" : "FAIL"}</span>
}

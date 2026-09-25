import { useState } from "react"
import { useApp } from "../lib/app.ts"
import { useBranches } from "../lib/data.ts"
import { run } from "../lib/bridge.ts"
import { invalidate } from "../lib/query.ts"
import { useT } from "../lib/i18n.ts"
import { Icon } from "../components/Icon.tsx"
import { HelpButton, useAutoTour } from "../components/Tour.tsx"
import { ErrorBox, Skeleton } from "../components/Primitives.tsx"

export function Branches() {
  const app = useApp()
  const { t } = useT()
  const branches = useBranches(app.workspace.root)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  useAutoTour("branches", Boolean(branches.data), "app")

  const act = async (key: string, args: string[], message: string) => {
    setBusy(key)
    try { await run(app.workspace.root, args); invalidate(app.workspace.root); app.toast(message) }
    catch (error) { app.toast((error as Error).message, "error") } finally { setBusy(null) }
  }
  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    await act("create", ["branch", "create", name.trim()], `${t("branches.new")} · ${name.trim()}`)
    setName("")
  }

  return (
    <div className="page-inner">
      <div className="page-head">
        <div><div className="eyebrow eyebrow-name">{app.workspace.name}</div><h1 className="title">{t("nav.branches")}</h1><p className="subtitle">{t("branches.hint")}</p></div>
        <HelpButton tour="branches" />
      </div>
      {branches.error ? <ErrorBox error={branches.error} onRetry={() => branches.refetch()} /> : null}
      <div className="card stagger" data-tour="branches-list" style={{ overflow: "hidden" }}>
        {!branches.data && !branches.error && Array.from({ length: 2 }, (_, index) => <div key={index} className="branch-row"><Skeleton height={18} /></div>)}
        {branches.data?.map((branch, index) => (
          <div key={branch.id} className={`branch-row ${branch.isCurrent ? "current" : ""}`} style={{ "--i": index } as React.CSSProperties}>
            <span className="node" />
            <div className="meta">
              <div className="n">{branch.name} <span className="kbd" style={{ marginLeft: 6 }}>{branch.id}</span></div>
              <div className="p">{branch.purpose ?? branch.slug} · {branch.status.toLowerCase()}</div>
            </div>
            {branch.isCurrent ? <span className="pill pill-solid">{t("branches.current")}</span> : (
              <button className="btn btn-secondary" disabled={busy !== null} onClick={() => act(branch.id, ["branch", "switch", branch.id], `${t("branches.switched")} · ${branch.name}`)}>
                {busy === branch.id ? <span className="spinner" /> : <Icon name="swap" size={16} />}{t("branches.switch")}
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="section-title">{t("branches.new")}</div>
      <form className="inline-form" data-tour="branches-new" onSubmit={create}>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("branches.namePlaceholder")} />
        <button className="btn btn-primary" disabled={!name.trim() || busy !== null}>{busy === "create" ? <span className="spinner" /> : <Icon name="plus" size={16} />}{t("branches.create")}</button>
      </form>
    </div>
  )
}

import { useDeferredValue, useMemo, useState } from "react"
import { useApp } from "../lib/app.ts"
import { run, runJson } from "../lib/bridge.ts"
import { invalidate } from "../lib/query.ts"
import { useT, type MessageKey } from "../lib/i18n.ts"
import { acceptsProtocol, configureArgs, groupOf, isGeneric, providerKeys, secretEnvName, suggestProfileId, useCatalog, useProfiles, useProviderStatus, usesUpstreamLogin, validProfileId, type ProviderDescriptor, type ProviderGroup, type WireProtocol } from "../lib/providers.ts"
import { Icon } from "../components/Icon.tsx"
import { Sheet } from "../components/Overlay.tsx"
import { Empty, ErrorBox, Segmented, Skeleton } from "../components/Primitives.tsx"

const CONNECTION: Record<string, MessageKey> = {
  SECRET_REQUIRED: "providers.conn.secret", CONFIGURED: "providers.conn.configured", CONNECTED: "providers.conn.connected", LOGIN_REQUIRED: "providers.conn.login",
  CLIENT_MISSING: "providers.conn.client", TERMS_RESTRICTED: "providers.conn.terms", RETIRED: "providers.conn.retired", UNCONFIGURED: "providers.conn.unconfigured",
}
const BILLING: Record<string, MessageKey> = { subscription: "providers.billing.subscription", payg: "providers.billing.payg", local: "providers.billing.local", enterprise: "providers.billing.enterprise", unknown: "providers.billing.unknown" }
const GROUPS: Array<ProviderGroup | "all"> = ["all", "plan", "api", "local", "generic"]

export function Providers() {
  const app = useApp()
  const { t } = useT()
  const root = app.workspace.root
  const catalog = useCatalog(root), profiles = useProfiles(root), status = useProviderStatus(root)
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState<ProviderGroup | "all">("all")
  const [adding, setAdding] = useState<ProviderDescriptor | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const deferred = useDeferredValue(query.trim().toLowerCase())
  const descriptors = useMemo(() => new Map((catalog.data?.providers ?? []).map((entry) => [entry.descriptor.id, entry.descriptor])), [catalog.data])
  const visible = useMemo(() => (catalog.data?.providers ?? [])
    .filter((entry) => group === "all" || groupOf(entry.descriptor) === group)
    .filter((entry) => !deferred || `${entry.descriptor.displayName} ${entry.descriptor.vendor} ${entry.descriptor.id}`.toLowerCase().includes(deferred))
    .sort((a, b) => Number(b.policy.allowed) - Number(a.policy.allowed) || a.descriptor.displayName.localeCompare(b.descriptor.displayName)), [catalog.data, group, deferred])

  const act = async (key: string, args: string[], message: string) => {
    setBusy(key)
    try { await run(root, args); invalidate(providerKeys.all); app.toast(message) }
    catch (error) { app.toast((error as Error).message, "error") } finally { setBusy(null) }
  }
  const rows = status.data?.profiles ?? []
  const secretRefOf = (id: string) => profiles.data?.profiles.find((profile) => profile.id === id)?.auth.secretRef ?? null
  const label = (map: Record<string, MessageKey>, value: string) => map[value] ? t(map[value]!) : value.toLowerCase().replace(/_/g, " ")

  return (
    <div className="page-inner">
      <div className="page-head">
        <div><div className="eyebrow">MathOS</div><h1 className="title">{t("providers.title")}</h1><p className="subtitle">{t("providers.hint")}</p></div>
      </div>

      <div className="section-title" style={{ marginTop: 8 }}>{t("providers.mine")}</div>
      {status.error ? <ErrorBox error={status.error} onRetry={() => status.refetch()} /> : null}
      <div className="card stagger" style={{ overflow: "hidden" }}>
        {!status.data && !status.error && <div className="branch-row"><Skeleton height={18} /></div>}
        {status.data && rows.length === 0 && <Empty glyph="⌁" title={t("providers.empty")}><p className="subtitle">{t("providers.emptyHint")}</p></Empty>}
        {rows.map((row, index) => {
          const isDefault = profiles.data?.defaultProfile === row.profile, ref = secretRefOf(row.profile)
          return (
            <div key={row.profile} className={`branch-row provider-row ${isDefault ? "current" : ""}`} style={{ "--i": index } as React.CSSProperties}>
              <span className="node" />
              <div className="meta">
                <div className="n">{row.profile} <span className="kbd" style={{ marginLeft: 6 }}>{descriptors.get(row.descriptor)?.displayName ?? row.descriptor}</span></div>
                <div className="p">{row.model} · {label(BILLING, row.billing)} · <span className={row.connection === "CONNECTED" || row.connection === "CONFIGURED" ? "" : "attention"}>{label(CONNECTION, row.connection)}</span></div>
                {row.connection === "SECRET_REQUIRED" && ref && <KeyHint secretRef={ref} />}
                {row.connection === "LOGIN_REQUIRED" && <KeyHint command={`mathos provider login ${row.profile}`} />}
              </div>
              {isDefault ? <span className="pill pill-solid">{t("providers.default")}</span> : (
                <button className="btn btn-secondary" disabled={busy !== null} onClick={() => act(`use-${row.profile}`, ["provider", "use", row.profile], `${t("providers.defaultSet")} · ${row.profile}`)}>
                  {busy === `use-${row.profile}` ? <span className="spinner" /> : <Icon name="target" size={16} />}{t("providers.makeDefault")}
                </button>
              )}
              <button className="btn btn-ghost btn-icon" title={t("providers.remove")} aria-label={`${t("providers.remove")} ${row.profile}`} disabled={busy !== null}
                onClick={() => { if (window.confirm(`${t("providers.removeConfirm")} ${row.profile}`)) void act(`rm-${row.profile}`, ["provider", "remove", row.profile], `${t("providers.removed")} · ${row.profile}`) }}>
                <Icon name="x" size={16} />
              </button>
            </div>
          )
        })}
      </div>

      <div className="section-title">{t("providers.add")}</div>
      <div className="provider-toolbar">
        <div className="search-wrap"><Icon name="search" size={16} /><input className="input input-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("providers.search")} aria-label={t("providers.search")} /></div>
        <Segmented value={group} onChange={setGroup} label={t("providers.add")} options={GROUPS.map((value) => ({ value, label: t(`providers.group.${value}` as MessageKey) }))} />
      </div>
      {catalog.error ? <ErrorBox error={catalog.error} onRetry={() => catalog.refetch()} /> : null}
      <div className="provider-grid stagger">
        {!catalog.data && !catalog.error && Array.from({ length: 6 }, (_, index) => <div key={index} className="card fact"><Skeleton height={16} /><Skeleton height={12} width="60%" style={{ marginTop: 8 }} /></div>)}
        {visible.map(({ descriptor, policy }, index) => (
          <button key={descriptor.id} type="button" className="card card-interactive provider-card" style={{ "--i": Math.min(index, 12) } as React.CSSProperties} disabled={!policy.allowed}
            title={policy.allowed ? descriptor.terms.summary : `${policy.code}${policy.remediation ? ` · ${policy.remediation}` : ""}`} onClick={() => setAdding(descriptor)}>
            <span className="k">{descriptor.displayName}</span>
            <span className="v">{descriptor.vendor} · {label(BILLING, descriptor.billingClass)}</span>
            {!policy.allowed ? <span className="pill pill-dashed">{t("providers.restricted")}</span> : acceptsProtocol(descriptor) && !isGeneric(descriptor) ? <span className="pill pill-soft">{t("providers.multiProtocol")}</span> : null}
          </button>
        ))}
        {catalog.data && visible.length === 0 && <p className="subtitle">{t("providers.noMatch")}</p>}
      </div>
      <p className="disclaimer">{t("providers.genericHint")}</p>
      <ConfigureSheet descriptor={adding} taken={(profiles.data?.profiles ?? []).map((profile) => profile.id)} onClose={() => setAdding(null)} />
    </div>
  )
}

function KeyHint({ secretRef, command }: { secretRef?: string; command?: string }) {
  const app = useApp()
  const { t } = useT()
  const text = command ?? `mathos secrets set ${secretRef}`
  return (
    <div className="key-hint">
      <span>{command ? t("providers.loginHint") : t("providers.keyHint")}</span>
      <code className="selectable">{text}</code>
      <button className="btn btn-ghost btn-icon" title={t("claims.copyId")} aria-label={t("claims.copyId")} onClick={() => { void navigator.clipboard?.writeText(text); app.toast(t("claims.copied")) }}><Icon name="copy" size={14} /></button>
      {secretRef && <span className="muted">{t("providers.envHint")} <code className="selectable">{secretEnvName(secretRef)}</code></span>}
    </div>
  )
}

function ConfigureSheet({ descriptor, taken, onClose }: { descriptor: ProviderDescriptor | null; taken: string[]; onClose: () => void }) {
  const app = useApp()
  const { t } = useT()
  const [form, setForm] = useState({ profile: "", model: "", baseUrl: "", protocol: "" as WireProtocol | "", headers: "" })
  const [forId, setForId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)
  if (descriptor && forId !== descriptor.id) {
    setForId(descriptor.id); setTouched(false)
    setForm({ profile: suggestProfileId(descriptor, taken), model: descriptor.defaultModels[0] ?? "", baseUrl: "", protocol: isGeneric(descriptor) ? descriptor.transport as WireProtocol : "", headers: "" })
  }
  const generic = descriptor ? isGeneric(descriptor) : false
  const errors = { profile: !validProfileId(form.profile) || taken.includes(form.profile.trim()), baseUrl: generic && !/^https?:\/\/\S+$/.test(form.baseUrl.trim()), model: generic && !form.model.trim() }
  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault(); setTouched(true)
    if (!descriptor || errors.profile || errors.baseUrl || errors.model) return
    setBusy(true)
    try {
      await runJson(app.workspace.root, configureArgs({ descriptor, ...form }))
      invalidate(providerKeys.all)
      app.toast(`${t("providers.configured")} · ${form.profile.trim()}`)
      setForId(null); onClose()
    } catch (error) { app.toast((error as Error).message, "error") } finally { setBusy(false) }
  }
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((value) => ({ ...value, [key]: event.target.value }))
  const protocols: Array<{ value: WireProtocol | ""; label: string }> = [
    ...(descriptor && !generic ? [{ value: "" as const, label: t("providers.protocolAuto") }] : []),
    { value: "openai-chat", label: "Chat" }, { value: "openai-responses", label: "Responses" }, { value: "anthropic-messages", label: "Anthropic" },
  ]

  return (
    <Sheet open={descriptor !== null} onClose={onClose} title={descriptor ? `${descriptor.displayName}` : ""}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn btn-primary" onClick={() => submit()} disabled={busy}>{busy ? <span className="spinner" /> : t("providers.save")}</button>
      </>}>
      {descriptor && <form onSubmit={submit} style={{ display: "contents" }}>
        <p className="subtitle" style={{ margin: 0 }}>{descriptor.terms.summary}</p>
        <label className="field">
          <span className="field-label">{t("providers.profile")}</span>
          <input className="input" value={form.profile} onChange={set("profile")} spellCheck={false} />
          {touched && errors.profile && <span className="field-error">{taken.includes(form.profile.trim()) ? t("providers.profileTaken") : t("providers.profileInvalid")}</span>}
        </label>
        {generic && <label className="field">
          <span className="field-label">{t("providers.baseUrl")}</span>
          <input className="input" value={form.baseUrl} onChange={set("baseUrl")} placeholder="https://llm.example.com/v1" spellCheck={false} inputMode="url" />
          {touched && errors.baseUrl && <span className="field-error">{t("providers.baseUrlInvalid")}</span>}
        </label>}
        <label className="field">
          <span className="field-label">{t("providers.model")}</span>
          <input className="input" value={form.model} onChange={set("model")} list="provider-models" placeholder={generic ? "model-id" : "auto"} spellCheck={false} />
          <datalist id="provider-models">{descriptor.defaultModels.map((model) => <option key={model} value={model} />)}</datalist>
          {touched && errors.model && <span className="field-error">{t("common.required")}</span>}
        </label>
        {acceptsProtocol(descriptor) && <div className="field">
          <span className="field-label">{t("providers.protocol")}</span>
          <Segmented value={form.protocol} onChange={(protocol) => setForm((value) => ({ ...value, protocol }))} options={protocols} label={t("providers.protocol")} />
        </div>}
        {generic && <label className="field">
          <span className="field-label">{t("providers.headers")}</span>
          <textarea className="textarea" value={form.headers} onChange={set("headers")} placeholder={"X-Title: MathOS"} spellCheck={false} style={{ minHeight: 72 }} />
          <span className="muted" style={{ fontSize: 12 }}>{t("providers.headersHint")}</span>
        </label>}
        <p className="disclaimer" style={{ margin: 0 }}>{usesUpstreamLogin(descriptor) ? t("providers.upstreamHint") : descriptor.authKinds.includes("none") ? t("providers.localHint") : t("providers.secretHint")}</p>
        <button type="submit" hidden />
      </form>}
    </Sheet>
  )
}

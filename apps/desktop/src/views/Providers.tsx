import { useDeferredValue, useMemo, useState } from "react"
import { useApp } from "../lib/app.ts"
import { MathosError, openExternal, run, runJson, setSecret } from "../lib/bridge.ts"
import { invalidate } from "../lib/query.ts"
import { useT, type MessageKey } from "../lib/i18n.ts"
import { acceptsProtocol, configureArgs, formFromProfile, groupOf, isGeneric, providerKeys, secretEnvName, suggestProfileId, useCatalog, useProfiles, useProviderStatus, usesUpstreamLogin, validProfileId, type CatalogEntry, type ProfileRow, type ProviderDescriptor, type ProviderGroup, type StatusRow, type WireProtocol } from "../lib/providers.ts"
import { FEATURED, keyPage, providerLogo, termsText } from "../lib/provider-meta.ts"
import { Icon } from "../components/Icon.tsx"
import { Sheet } from "../components/Overlay.tsx"
import { ErrorBox, Segmented, Skeleton } from "../components/Primitives.tsx"
import { errorText, policyReason, providerName, providerVendor } from "../lib/cli-text.ts"
import { HelpButton, useAutoTour } from "../components/Tour.tsx"
import { ClientLogin } from "./ClientLogin.tsx"
import { RemoteBlockedCallout } from "../components/Privacy.tsx"
import { useRemoteModels } from "../lib/privacy.ts"

const BILLING: Record<string, MessageKey> = { subscription: "providers.billing.subscription", payg: "providers.billing.payg", local: "providers.billing.local", enterprise: "providers.billing.enterprise", unknown: "providers.billing.unknown" }
const GROUPS: Array<ProviderGroup | "all"> = ["all", "plan", "api", "local", "generic"]
type WizardStep = "setup" | "key" | "test"
/** `session` changes only when the sheet is opened, so moving between steps keeps what the user typed. */
interface WizardState { descriptor: ProviderDescriptor; step: WizardStep; profile: string | null; session: number }
let sessions = 0

export function ProviderLogo({ descriptor, size = 36 }: { descriptor: Pick<ProviderDescriptor, "id" | "displayName">; size?: number }) {
  const svg = providerLogo(descriptor.id)
  if (svg) return <span className="provider-logo" style={{ width: size, height: size, fontSize: size * 0.56 }} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
  const generic = descriptor.id.startsWith("generic-")
  return <span className="provider-logo mono" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>{generic ? <Icon name="plug" size={Math.round(size * 0.5)} /> : descriptor.displayName.slice(0, 1).toUpperCase()}</span>
}

export function Providers() {
  const app = useApp()
  const { t, lang } = useT()
  const root = app.workspace.root
  const catalog = useCatalog(root), profiles = useProfiles(root), status = useProviderStatus(root)
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState<ProviderGroup | "all">("all")
  const [wizard, setWizard] = useState<WizardState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const deferred = useDeferredValue(query.trim().toLowerCase())
  const entries = catalog.data?.providers ?? []
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.descriptor.id, entry])), [entries])
  const featured = FEATURED.map((id) => byId.get(id)).filter((entry): entry is CatalogEntry => Boolean(entry?.policy.allowed))
  const visible = useMemo(() => entries
    .filter((entry) => group === "all" || groupOf(entry.descriptor) === group)
    .filter((entry) => !deferred || `${entry.descriptor.displayName} ${providerName(entry.descriptor, lang)} ${entry.descriptor.vendor} ${entry.descriptor.id}`.toLowerCase().includes(deferred))
    .sort((a, b) => Number(b.policy.allowed) - Number(a.policy.allowed) || providerName(a.descriptor, lang).localeCompare(providerName(b.descriptor, lang), lang)), [entries, group, deferred, lang])
  const rows = status.data?.profiles ?? []
  const defaultProfile = profiles.data?.defaultProfile ?? null
  useAutoTour("providers", Boolean(status.data && catalog.data), "app")

  const act = async (key: string, args: string[], message: string) => {
    setBusy(key)
    try { await run(root, args); invalidate(providerKeys.all); app.toast(message) }
    catch (error) { app.toast(errorText(error, app.lang), "error") } finally { setBusy(null) }
  }
  const open = (descriptor: ProviderDescriptor, step: WizardStep = "setup", profile: string | null = null) => setWizard({ descriptor, step, profile, session: ++sessions })
  const openFor = (row: StatusRow, step: WizardStep) => { const entry = byId.get(row.descriptor); if (entry) open(entry.descriptor, step, row.profile) }

  return (
    <div className="page-inner providers-page">
      <div className="page-head">
        <div><div className="eyebrow">MathOS</div><h1 className="title">{t("providers.title")}</h1><p className="subtitle">{t("providers.hint")}</p></div>
        <HelpButton tour="providers" />
      </div>

      {status.data && rows.length === 0 && (
        <div className="card connect-hero view-enter" data-tour="providers-hero">
          <h2>{t("providers.heroTitle")}</h2>
          <ol className="connect-steps">
            {(["providers.heroStep1", "providers.heroStep2", "providers.heroStep3"] as const).map((key, index) => <li key={key}><span className="n">{index + 1}</span>{t(key)}</li>)}
          </ol>
        </div>
      )}

      {rows.length > 0 && <>
        <div className="section-title" style={{ marginTop: 8 }}>{t("providers.mine")}</div>
        {rows.some((row) => row.remote) && <RemoteBlockedCallout />}
        <div className="card profile-list stagger" data-tour="providers-mine">
          {rows.map((row, index) => {
            const entry = byId.get(row.descriptor), isDefault = defaultProfile === row.profile
            const blockedByPrivacy = row.remote === true && status.data?.remoteModelsAllowed === false
            const ready = !blockedByPrivacy && (row.connection === "CONFIGURED" || row.connection === "CONNECTED" || row.connection === "LOCAL_OFFLINE")
            return (
              <div key={row.profile} className="profile-row" style={{ "--i": index } as React.CSSProperties}>
                <ProviderLogo descriptor={entry?.descriptor ?? { id: row.descriptor, displayName: row.descriptor }} size={36} />
                <div className="meta">
                  <div className="n">{entry ? providerName(entry.descriptor, lang) : row.descriptor}{isDefault && <span className="pill pill-solid pill-xs">{t("providers.default")}</span>}</div>
                  <div className="p">{row.profile} · {row.model} · {t(BILLING[row.billing] ?? "providers.billing.unknown")}</div>
                </div>
                <span className={`status-chip ${ready ? "ok" : "todo"}`}><span className="dot" />{t(ready ? "providers.state.ready" : blockedByPrivacy && (row.connection === "CONFIGURED" || row.connection === "CONNECTED") ? "providers.state.privacy" : row.connection === "LOGIN_REQUIRED" ? "providers.state.login" : row.connection === "CLIENT_MISSING" ? "providers.state.client" : row.connection === "SECRET_REQUIRED" ? "providers.state.key" : "providers.state.blocked")}</span>
                <div className="actions">
                  {row.connection === "SECRET_REQUIRED" ? <button className="btn btn-primary btn-sm" onClick={() => openFor(row, "key")}><Icon name="plus" size={14} />{t("providers.addKey")}</button>
                    : row.connection === "LOGIN_REQUIRED" || row.connection === "CLIENT_MISSING" ? <button className="btn btn-primary btn-sm" onClick={() => openFor(row, "key")}>{t(row.connection === "CLIENT_MISSING" ? "providers.installClient" : "providers.howToLogin")}</button>
                    : <button className="btn btn-secondary btn-sm" onClick={() => openFor(row, "test")}>{t("providers.test")}</button>}
                  {!isDefault && <button className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => act(`use-${row.profile}`, ["provider", "use", row.profile], `${t("providers.defaultSet")} · ${row.profile}`)}>{busy === `use-${row.profile}` ? <span className="spinner" /> : t("providers.makeDefault")}</button>}
                  <button className="btn btn-ghost btn-icon" title={t("providers.remove")} aria-label={`${t("providers.remove")} ${row.profile}`} disabled={busy !== null}
                    onClick={() => { if (window.confirm(`${t("providers.removeConfirm")} ${row.profile}`)) void act(`rm-${row.profile}`, ["provider", "remove", row.profile], `${t("providers.removed")} · ${row.profile}`) }}>
                    <Icon name="x" size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </>}
      {status.error ? <ErrorBox error={status.error} onRetry={() => status.refetch()} /> : null}

      <div className="section-title">{t("providers.featured")}</div>
      <div className="featured-grid stagger" data-tour="providers-featured">
        {!catalog.data && !catalog.error && Array.from({ length: 4 }, (_, index) => <div key={index} className="card featured-card"><Skeleton height={40} width={40} /><Skeleton height={14} width="70%" /></div>)}
        {featured.map(({ descriptor }, index) => (
          <button key={descriptor.id} type="button" className="card card-interactive featured-card" style={{ "--i": index } as React.CSSProperties} onClick={() => open(descriptor)}>
            <ProviderLogo descriptor={descriptor} size={40} />
            <span className="k">{providerName(descriptor, lang)}</span>
            <span className="v">{t(BILLING[descriptor.billingClass] ?? "providers.billing.unknown")}</span>
            <span className="go">{t("providers.connect")} <Icon name="arrow" size={14} /></span>
          </button>
        ))}
      </div>

      <div className="section-title">{t("providers.all")}</div>
      <div className="provider-toolbar" data-tour="providers-search">
        <div className="search-wrap"><Icon name="search" size={16} /><input className="input input-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("providers.search")} aria-label={t("providers.search")} /></div>
        <Segmented value={group} onChange={setGroup} label={t("providers.all")} options={GROUPS.map((value) => ({ value, label: t(`providers.group.${value}` as MessageKey) }))} />
      </div>
      {catalog.error ? <ErrorBox error={catalog.error} onRetry={() => catalog.refetch()} /> : null}
      <div className="provider-grid">
        {visible.map(({ descriptor, policy }) => (
          <button key={descriptor.id} type="button" className="provider-tile" disabled={!policy.allowed} onClick={() => open(descriptor)}
            title={policy.allowed ? termsText(descriptor, lang) : `${t("providers.restricted")} · ${policyReason(policy, lang)}`}>
            <ProviderLogo descriptor={descriptor} size={30} />
            <span className="meta"><span className="k">{providerName(descriptor, lang)}</span><span className="v">{providerVendor(descriptor.vendor, lang)} · {t(BILLING[descriptor.billingClass] ?? "providers.billing.unknown")}</span></span>
            {!policy.allowed ? <span className="pill pill-dashed pill-xs">{t("providers.restricted")}</span> : <Icon name="plus" size={15} />}
          </button>
        ))}
        {catalog.data && visible.length === 0 && <p className="subtitle">{t("providers.noMatch")}</p>}
      </div>
      <p className="disclaimer">{t("providers.genericHint")}</p>

      <ConnectWizard state={wizard} profiles={profiles.data?.profiles ?? []} taken={(profiles.data?.profiles ?? []).map((profile) => profile.id)} hasDefault={Boolean(defaultProfile)}
        secretRefOf={(id) => profiles.data?.profiles.find((profile) => profile.id === id)?.auth.secretRef ?? `model.${id}`}
        onStep={(step, profile) => setWizard((value) => value && { ...value, step, profile: profile ?? value.profile })} onClose={() => setWizard(null)} />
    </div>
  )
}

function ConnectWizard({ state, profiles, taken, hasDefault, secretRefOf, onStep, onClose }: { state: WizardState | null; profiles: ProfileRow[]; taken: string[]; hasDefault: boolean; secretRefOf: (id: string) => string; onStep: (step: WizardStep, profile?: string) => void; onClose: () => void }) {
  const app = useApp()
  const { t, lang } = useT()
  const [storeBlocked, setStoreBlocked] = useState(false)
  const descriptor = state?.descriptor ?? null
  const [form, setForm] = useState({ profile: "", model: "", baseUrl: "", protocol: "" as WireProtocol | "", headers: "" })
  const [forKey, setForKey] = useState<string | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const [secret, setSecretValue] = useState("")
  const [reveal, setReveal] = useState(false)
  const [makeDefault, setMakeDefault] = useState(!hasDefault)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const privacy = useRemoteModels(app.workspace.root)
  // The settings last written to the profile; going back to "Set up" and changing them updates it.
  const [saved, setSaved] = useState<string | null>(null)
  const identity = state ? String(state.session) : null
  if (state && descriptor && identity !== forKey) {
    const existing = state.profile ? profiles.find((row) => row.id === state.profile) : undefined
    const initial = existing ? formFromProfile(descriptor, existing) : { profile: suggestProfileId(descriptor, taken), model: descriptor.defaultModels[0] ?? "", baseUrl: "", protocol: (isGeneric(descriptor) ? descriptor.transport : "") as WireProtocol | "", headers: "" }
    setForKey(identity); setTouched(false); setAdvanced(isGeneric(descriptor)); setSecretValue(""); setReveal(false); setResult(null); setStoreBlocked(false); setConsent(false); setMakeDefault(!hasDefault)
    setForm(initial); setSaved(existing ? JSON.stringify(initial) : null)
  }
  if (!state || !descriptor) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>

  const generic = isGeneric(descriptor), upstream = usesUpstreamLogin(descriptor), local = descriptor.authKinds.includes("none")
  const steps: Array<{ id: WizardStep; label: MessageKey }> = [{ id: "setup", label: "providers.step.setup" }, ...(local ? [] : [{ id: "key" as const, label: upstream ? "providers.step.login" as const : "providers.step.key" as const }]), { id: "test", label: "providers.step.test" }]
  const profileId = state.profile ?? form.profile.trim()
  const errors = { profile: !state.profile && (!validProfileId(form.profile) || taken.includes(form.profile.trim())), baseUrl: generic && !/^https?:\/\/\S+$/.test(form.baseUrl.trim()), model: generic && !form.model.trim() }
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((value) => ({ ...value, [key]: event.target.value }))
  const guard = async (work: () => Promise<void>) => { setBusy(true); try { await work() } catch (error) { app.toast(errorText(error, app.lang), "error") } finally { setBusy(false) } }

  const saveSetup = () => guard(async () => {
    setTouched(true)
    if (errors.profile || errors.baseUrl || errors.model) return
    const snapshot = JSON.stringify({ ...form, profile: profileId })
    if (!state.profile) {
      await runJson(app.workspace.root, configureArgs({ descriptor, ...form }))
      if (makeDefault) await run(app.workspace.root, ["provider", "use", form.profile.trim()])
      invalidate(providerKeys.all)
    } else if (snapshot !== saved) {
      await runJson(app.workspace.root, [...configureArgs({ descriptor, ...form, profile: profileId }), "--update"])
      invalidate(providerKeys.all)
      app.toast(t("providers.updated"))
    }
    setSaved(snapshot); setResult(null)
    onStep(local ? "test" : "key", profileId)
  })
  const saveKey = () => guard(async () => {
    if (!secret.trim()) { setTouched(true); return }
    try { await setSecret(secretRefOf(profileId), secret.trim()) }
    catch (error) { if (error instanceof MathosError && error.code === "SECRET_STORE_BLOCKED") { setStoreBlocked(true); return } throw error }
    setSecretValue("")
    invalidate(providerKeys.all)
    app.toast(t("providers.keySaved"))
    onStep("test")
  })
  // The test obeys the same privacy rule as real use, so it is not offered while cloud models are off.
  const privacyBlocked = descriptor.remote && privacy.data?.value === false
  const runTest = () => guard(async () => {
    const args = ["provider", "test", profileId, "--live", ...(descriptor.billingClass === "payg" ? ["--accept-usage"] : [])]
    const report = await runJson<{ connection: string; liveRequest: string }>(app.workspace.root, args, { allowNonZero: true })
    const ok = report.connection === "CONNECTED"
    setResult({ ok, text: ok ? t("providers.testOk") : report.liveRequest === "REMOTE_MODELS_DISABLED" ? t("privacy.blockedHint") : `${t("providers.testFail")} (${report.connection} · ${report.liveRequest})` })
    invalidate(providerKeys.all)
  })
  const protocols: Array<{ value: WireProtocol | ""; label: string }> = [...(!generic ? [{ value: "" as const, label: t("providers.protocolAuto") }] : []), { value: "openai-chat", label: "Chat" }, { value: "openai-responses", label: "Responses" }, { value: "anthropic-messages", label: "Anthropic" }]
  const docs = descriptor.terms.officialSources[0] ?? null, keyUrl = keyPage(descriptor.id)

  const current = steps.findIndex((item) => item.id === state.step)
  // Earlier steps are always reachable; later ones only once the profile exists.
  const reachable = (index: number) => index !== current && (index < current || Boolean(state.profile))
  const back = current > 0 ? <button className="btn btn-ghost wizard-back" onClick={() => onStep(steps[current - 1]!.id)} disabled={busy}><span className="flip" aria-hidden><Icon name="arrow" size={14} /></span>{t("providers.back")}</button> : null
  const footer = state.step === "setup" ? <>
      <button className="btn btn-secondary" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn btn-primary" onClick={() => void saveSetup()} disabled={busy}>{busy ? <span className="spinner" /> : t("providers.continue")}</button>
    </> : state.step === "key" ? <>
      {back}
      <button className="btn btn-ghost" onClick={() => onStep("test")}>{t("providers.later")}</button>
      {!upstream && <button className="btn btn-primary" onClick={() => void saveKey()} disabled={busy}>{busy ? <span className="spinner" /> : t("providers.saveKey")}</button>}
      {upstream && <button className="btn btn-secondary" onClick={() => onStep("test")}>{t("providers.continue")}</button>}
    </> : <>
      {back}
      <button className="btn btn-secondary" onClick={onClose}>{t("providers.done")}</button>
      <button className="btn btn-primary" onClick={() => void runTest()} disabled={busy || !consent || privacyBlocked}>{busy ? <span className="spinner" /> : t("providers.runTest")}</button>
    </>

  return (
    <Sheet open onClose={onClose} title={providerName(descriptor, lang)} footer={footer}>
      <div className="wizard-head">
        <ProviderLogo descriptor={descriptor} size={44} />
        <div><div className="subtitle" style={{ margin: 0 }}>{providerVendor(descriptor.vendor, lang)} · {t(BILLING[descriptor.billingClass] ?? "providers.billing.unknown")}</div>
          {docs && <button className="link-btn" onClick={() => void openExternal(docs)}>{t("providers.docs")} <Icon name="arrow" size={12} /></button>}</div>
      </div>
      <ol className="stepper" aria-label={t("providers.progress")}>
        {steps.map((step, index) => {
          const inner = <><span className="n">{index < current ? <Icon name="check" size={11} stroke={2.6} /> : index + 1}</span>{t(step.label)}</>
          return <li key={step.id} className={index < current ? "done" : index === current ? "current" : ""} aria-current={index === current ? "step" : undefined}>
            {reachable(index) ? <button type="button" className="step-btn" onClick={() => onStep(step.id)} disabled={busy} title={t(step.label)}>{inner}</button> : <span className="step-btn">{inner}</span>}
          </li>
        })}
      </ol>

      {state.step === "setup" && <form onSubmit={(event) => { event.preventDefault(); void saveSetup() }} style={{ display: "contents" }}>
        <p className="subtitle" style={{ margin: 0 }}>{termsText(descriptor, lang)}</p>
        {generic && <label className="field"><span className="field-label">{t("providers.baseUrl")}</span>
          <input className="input" value={form.baseUrl} onChange={set("baseUrl")} placeholder="https://llm.example.com/v1" spellCheck={false} inputMode="url" />
          {touched && errors.baseUrl && <span className="field-error">{t("providers.baseUrlInvalid")}</span>}</label>}
        <label className="field"><span className="field-label">{t("providers.model")}</span>
          <input className="input" value={form.model} onChange={set("model")} placeholder={generic ? "model-id" : "auto"} spellCheck={false} />
          {touched && errors.model && <span className="field-error">{t("common.required")}</span>}
          {descriptor.defaultModels.length > 0 && <div className="chips">{descriptor.defaultModels.slice(0, 8).map((model) => <button key={model} type="button" className={`chip ${form.model === model ? "on" : ""}`} onClick={() => setForm((value) => ({ ...value, model }))}>{model}</button>)}</div>}
        </label>
        {!state.profile && <label className="check"><input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} />{t("providers.useAsDefault")}</label>}
        <button type="button" className="link-btn" onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}>{t("providers.advanced")} <Icon name="chevrons" size={12} /></button>
        {advanced && <div className="advanced">
          <label className="field"><span className="field-label">{t("providers.profile")}</span>
            <input className="input" value={form.profile} onChange={set("profile")} spellCheck={false} disabled={Boolean(state.profile)} title={state.profile ? t("providers.profileLocked") : undefined} />
            {touched && errors.profile && <span className="field-error">{taken.includes(form.profile.trim()) ? t("providers.profileTaken") : t("providers.profileInvalid")}</span>}</label>
          {acceptsProtocol(descriptor) && <div className="field"><span className="field-label">{t("providers.protocol")}</span>
            <Segmented value={form.protocol} onChange={(protocol) => setForm((value) => ({ ...value, protocol }))} options={protocols} label={t("providers.protocol")} /></div>}
          {generic && <label className="field"><span className="field-label">{t("providers.headers")}</span>
            <textarea className="textarea" value={form.headers} onChange={set("headers")} placeholder="X-Title: MathOS" spellCheck={false} style={{ minHeight: 64 }} />
            <span className="field-hint">{t("providers.headersHint")}</span></label>}
        </div>}
        <button type="submit" hidden />
      </form>}

      {state.step === "key" && !upstream && <form onSubmit={(event) => { event.preventDefault(); void saveKey() }} style={{ display: "contents" }}>
        <div className="key-step">
          <div className="n">1</div>
          <div><strong>{t("providers.getKeyTitle")}</strong><p className="field-hint">{keyUrl ? t("providers.getKeyHint") : t("providers.getKeyDocsHint")}</p>
            {(keyUrl ?? docs) && <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openExternal((keyUrl ?? docs)!)}>{t(keyUrl ? "providers.openKeyPage" : "providers.docs")} <Icon name="arrow" size={13} /></button>}</div>
        </div>
        <div className="key-step">
          <div className="n">2</div>
          <label className="field" style={{ flex: 1 }}><strong>{t("providers.pasteKey")}</strong>
            <span className="secret-input">
              <input className="input" type={reveal ? "text" : "password"} value={secret} onChange={(event) => setSecretValue(event.target.value)} autoComplete="off" spellCheck={false} placeholder="sk-…" aria-label={t("providers.pasteKey")} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReveal((value) => !value)}>{t(reveal ? "providers.hide" : "providers.show")}</button>
            </span>
            {touched && !secret.trim() && <span className="field-error">{t("common.required")}</span>}
            <span className="field-hint">{t("providers.keySafety")} <code>{secretEnvName(secretRefOf(profileId))}</code></span>
            {storeBlocked && <div className="callout" role="alert"><Icon name="info" size={16} /><span>{t("providers.storeBlocked")} <code className="selectable">{secretEnvName(secretRefOf(profileId))}</code></span></div>}
          </label>
        </div>
        <button type="submit" hidden />
      </form>}

      {state.step === "key" && upstream && <ClientLogin key={profileId} profile={profileId} accountName={providerName(descriptor, lang)} onSignedIn={() => onStep("test")} />}

      {state.step === "test" && <div className="test-step">
        <p className="subtitle" style={{ margin: 0 }}>{t("providers.testHint")}</p>
        {descriptor.remote && <RemoteBlockedCallout compact />}
        <label className="check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />{t(descriptor.billingClass === "payg" ? "providers.consentPaid" : "providers.consent")}</label>
        {result && <div className={`test-result ${result.ok ? "ok" : "no"}`} role="status"><Icon name={result.ok ? "check" : "info"} size={16} />{result.text}</div>}
      </div>}
    </Sheet>
  )
}

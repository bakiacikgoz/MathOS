import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { mod, NAV, useApp, type RecentWorkspace, type Route } from "../lib/app.ts"
import { runJson } from "../lib/bridge.ts"
import { useBranches, useClaims, useDoctor } from "../lib/data.ts"
import { useProviderStatus } from "../lib/providers.ts"
import { useT, type MessageKey } from "../lib/i18n.ts"
import type { ThemePref } from "../lib/theme.ts"
import { Icon, Mark, type IconName } from "./Icon.tsx"
import { Wordmark } from "./Brand.tsx"
import { errorText } from "../lib/cli-text.ts"
import { useAutoTour } from "./Tour.tsx"

type Signal = { kind: "count"; value: number } | { kind: "dot"; tone: "strong" | "soft"; title: MessageKey } | null

export function Sidebar({ onPalette }: { onPalette: () => void }) {
  const app = useApp()
  const { t } = useT()
  const collapsed = app.sidebar.collapsed
  const nav = useRef<HTMLElement>(null)
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null)
  const signals = useNavSignals()
  useAutoTour("app")

  // The highlight slides between items; measure the active row so grouping and wrapping never misplace it.
  useLayoutEffect(() => {
    const active = nav.current?.querySelector<HTMLElement>(".nav-item.active")
    setIndicator(active ? { top: active.offsetTop, height: active.offsetHeight } : null)
  }, [app.route, collapsed])

  const groups: Array<{ id: "research" | "system"; label: MessageKey }> = [{ id: "research", label: "nav.group.research" }, { id: "system", label: "nav.group.system" }]

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label={t("sidebar.label")}>
      {/* The full logo when there is room; the compact mark when the sidebar is collapsed. */}
      <div className="sidebar-brand" data-tauri-drag-region>
        {collapsed ? <Mark size={34} /> : <Wordmark height={54} className="wordmark" />}
      </div>
      <WorkspaceSwitcher collapsed={collapsed} />

      <button className="sidebar-search" data-tour="search" onClick={onPalette} title={collapsed ? `${t("nav.search")} (${mod}K)` : undefined} aria-label={t("nav.search")}>
        <Icon name="search" size={15} />
        <span className="label">{t("sidebar.search")}</span>
        <span className="kbd">{mod}K</span>
      </button>

      <nav className="nav" ref={nav}>
        <span className="nav-indicator" style={{ transform: `translateY(${indicator?.top ?? 0}px)`, height: indicator?.height ?? 34, opacity: indicator === null ? 0 : 1 }} />
        {groups.map((group) => (
          <div key={group.id} className="nav-group" role="group" aria-label={t(group.label)} data-tour={`nav-${group.id}`}>
            <div className="nav-group-label" aria-hidden>{t(group.label)}</div>
            {NAV.filter((item) => item.group === group.id).map((item) => (
              <NavItem key={item.route} route={item.route} icon={item.icon} label={t(item.label)} shortcut={item.key ? `${mod}${item.key}` : ""} signal={signals[item.route] ?? null} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot" data-tour="sidebar-foot">
        <NavItem route="settings" icon="settings" label={t("nav.settings")} shortcut={`${mod},`} signal={null} collapsed={collapsed} />
        <div className="sidebar-foot-row">
          <ThemeSwitch />
          <LangSwitch />
          <button className="icon-btn" onClick={app.sidebar.toggle} title={`${t(collapsed ? "sidebar.expand" : "sidebar.collapse")} (${mod}B)`} aria-label={t(collapsed ? "sidebar.expand" : "sidebar.collapse")} aria-expanded={!collapsed}>
            <Icon name="panel" size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}

function NavItem({ route, icon, label, shortcut, signal, collapsed }: { route: Route; icon: IconName; label: string; shortcut: string; signal: Signal; collapsed: boolean }) {
  const app = useApp()
  const { t } = useT()
  const active = app.route === route
  const hint = signal?.kind === "dot" ? t(signal.title) : null
  return (
    <button className={`nav-item ${active ? "active" : ""}`} data-tour={`nav-${route}`} onClick={() => app.navigate(route)} aria-current={active ? "page" : undefined}
      title={collapsed ? [label, hint].filter(Boolean).join(" · ") : hint ?? undefined}>
      <span className="nav-icon"><Icon name={icon} size={17} />{collapsed && signal?.kind === "dot" && <span className={`nav-dot ${signal.tone}`} />}</span>
      <span className="label">{label}</span>
      {signal?.kind === "count" && <span className="nav-count">{signal.value}</span>}
      {signal?.kind === "dot" && <span className={`nav-dot ${signal.tone}`} aria-label={hint ?? undefined} />}
      <span className="kbd">{shortcut}</span>
    </button>
  )
}

/** Live, truthful hints: counts come straight from the CLI; dots only when something needs the user. */
function useNavSignals(): Partial<Record<Route, Signal>> {
  const app = useApp()
  const root = app.workspace.root
  const claims = useClaims(root), branches = useBranches(root), doctor = useDoctor(root), providers = useProviderStatus(root)
  const checks = doctor.data?.checks ?? []
  const pending = (providers.data?.profiles ?? []).some((row) => ["SECRET_REQUIRED", "LOGIN_REQUIRED", "CLIENT_MISSING"].includes(row.connection))
  return {
    claims: claims.data ? { kind: "count", value: claims.data.length } : null,
    branches: branches.data && branches.data.length > 1 ? { kind: "count", value: branches.data.length } : null,
    health: checks.some((check) => check.status === "FAIL") ? { kind: "dot", tone: "strong", title: "sidebar.healthFail" } : checks.some((check) => check.status === "WARN") ? { kind: "dot", tone: "soft", title: "sidebar.healthWarn" } : null,
    providers: pending ? { kind: "dot", tone: "strong", title: "sidebar.providersAttention" } : null,
  }
}

function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const app = useApp()
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const others = app.recent.filter((row) => row.root !== app.workspace.root).slice(0, 6)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false) } }
    window.addEventListener("mousedown", onDown); window.addEventListener("keydown", onKey, true)
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(".menu [role=menuitem]")?.focus())
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey, true) }
  }, [open])

  // A remembered folder may have moved or been deleted; check it before switching.
  const switchTo = async (row: RecentWorkspace) => {
    setBusy(row.root)
    try { await runJson(row.root, ["status"]); setOpen(false); app.openWorkspace({ root: row.root, name: row.name }) }
    catch (error) { app.toast(`${row.name}: ${errorText(error, app.lang)}`, "error") } finally { setBusy(null) }
  }
  const onMenuKey = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(".menu [role=menuitem]") ?? [])], index = items.indexOf(document.activeElement as HTMLElement)
    items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus()
  }

  return (
    <div className="ws-switcher" ref={ref} data-tour="ws">
      <button className={`workspace-chip ${open ? "open" : ""}`} onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open} title={collapsed ? app.workspace.name : app.workspace.root}>
        <span className="ws-initial lg" aria-hidden>{app.workspace.name.slice(0, 1).toUpperCase()}</span>
        <span className="meta"><span className="name">{app.workspace.name}</span><span className="path">{shortPath(app.workspace.root)}</span></span>
        <Icon name="chevrons" size={14} />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label={t("nav.switchWorkspace")} onKeyDown={onMenuKey}>
          <div className="menu-label">{t("sidebar.recent")}</div>
          {others.length === 0 && <div className="menu-empty">{t("sidebar.noRecent")}</div>}
          {others.map((row) => (
            <button key={row.root} role="menuitem" className="menu-item" onClick={() => void switchTo(row)} disabled={busy !== null} title={row.root}>
              <span className="ws-initial" aria-hidden>{row.name.slice(0, 1).toUpperCase()}</span>
              <span className="meta"><span className="name">{row.name}</span><span className="path">{shortPath(row.root)}</span></span>
              {busy === row.root && <span className="spinner" />}
            </button>
          ))}
          <div className="menu-sep" />
          <button role="menuitem" className="menu-item" onClick={() => { setOpen(false); app.closeWorkspace() }}>
            <Icon name="folder" size={15} /><span className="meta"><span className="name">{t("sidebar.allWorkspaces")}</span></span>
          </button>
        </div>
      )}
    </div>
  )
}

/** Language lives next to the theme: both are "how the app looks", reachable from every screen. */
function LangSwitch() {
  const app = useApp()
  const { t } = useT()
  const options: Array<{ value: "tr" | "en"; label: string; name: string }> = [{ value: "tr", label: "TR", name: "Türkçe" }, { value: "en", label: "EN", name: "English" }]
  return (
    <div className="theme-switch lang-switch" role="radiogroup" aria-label={t("settings.language")}>
      {options.map((option) => (
        <button key={option.value} role="radio" aria-checked={app.lang === option.value} className={app.lang === option.value ? "on" : ""}
          title={`${t("settings.language")}: ${option.name}`} aria-label={option.name} lang={option.value} onClick={() => app.setLang(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

function ThemeSwitch() {
  const app = useApp()
  const { t } = useT()
  const options: Array<{ value: ThemePref; icon: IconName; label: MessageKey }> = [{ value: "light", icon: "sun", label: "settings.light" }, { value: "dark", icon: "moon", label: "settings.dark" }, { value: "system", icon: "system", label: "settings.system" }]
  return (
    <div className="theme-switch" role="radiogroup" aria-label={t("settings.appearance")}>
      {options.map((option) => (
        <button key={option.value} role="radio" aria-checked={app.theme.pref === option.value} className={app.theme.pref === option.value ? "on" : ""}
          title={`${t("settings.appearance")}: ${t(option.label)}`} aria-label={t(option.label)}
          onClick={(event) => app.theme.set(option.value, { x: event.clientX, y: event.clientY })}>
          <Icon name={option.icon} size={14} />
        </button>
      ))}
    </div>
  )
}

function shortPath(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path
}

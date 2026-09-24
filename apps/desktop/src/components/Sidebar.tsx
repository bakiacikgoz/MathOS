import { useLayoutEffect, useRef, useState } from "react"
import { mod, NAV, useApp } from "../lib/app.ts"
import { useT } from "../lib/i18n.ts"
import type { ThemePref } from "../lib/theme.ts"
import { Icon, Mark } from "./Icon.tsx"

export function Sidebar({ onPalette }: { onPalette: () => void }) {
  const app = useApp()
  const { t } = useT()
  const nav = useRef<HTMLElement>(null)
  const [indicator, setIndicator] = useState<number | null>(null)

  useLayoutEffect(() => {
    const active = nav.current?.querySelector<HTMLElement>(".nav-item.active")
    setIndicator(active ? active.offsetTop : null)
  }, [app.route])

  const cycleTheme = (event: React.MouseEvent) => {
    const order: ThemePref[] = ["system", "light", "dark"]
    app.theme.set(order[(order.indexOf(app.theme.pref) + 1) % order.length]!, { x: event.clientX, y: event.clientY })
  }
  const themeLabel = app.theme.pref === "system" ? t("settings.system") : app.theme.pref === "dark" ? t("settings.dark") : t("settings.light")

  return (
    <aside className="sidebar">
      <button className="workspace-chip" onClick={app.closeWorkspace} title={t("nav.switchWorkspace")}>
        <Mark size={28} />
        <div className="meta"><div className="name">{app.workspace.name}</div><div className="path" title={app.workspace.root}>{shortPath(app.workspace.root)}</div></div>
      </button>
      <nav className="nav" ref={nav}>
        <span className="nav-indicator" style={{ transform: `translateY(${indicator ?? 0}px)`, opacity: indicator === null ? 0 : 1 }} />
        {NAV.map((item) => (
          <button key={item.route} className={`nav-item ${app.route === item.route ? "active" : ""}`} onClick={() => app.navigate(item.route)} aria-current={app.route === item.route ? "page" : undefined}>
            <Icon name={item.icon} /><span className="label">{t(item.label)}</span><span className="kbd">{mod}{item.key}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <button className="nav-item" onClick={onPalette}><Icon name="search" /><span className="label">{t("nav.search")}</span><span className="kbd" style={{ opacity: 1 }}>{mod}K</span></button>
        <button className="nav-item" onClick={cycleTheme}><Icon name={app.theme.pref === "system" ? "system" : app.theme.pref === "dark" ? "moon" : "sun"} />{themeLabel}</button>
        <button className={`nav-item ${app.route === "settings" ? "active" : ""}`} onClick={() => app.navigate("settings")}><Icon name="settings" />{t("nav.settings")}</button>
      </div>
    </aside>
  )
}

function shortPath(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path
}

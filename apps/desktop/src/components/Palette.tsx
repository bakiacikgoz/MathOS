import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { mod, NAV, useApp } from "../lib/app.ts"
import { useClaims } from "../lib/data.ts"
import { useT } from "../lib/i18n.ts"
import { Icon, type IconName } from "./Icon.tsx"
import { usePresence } from "./Overlay.tsx"

interface Item { id: string; label: string; hint?: string; icon: IconName; run: () => void }

export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp()
  const { t } = useT()
  const { mounted, closing } = usePresence(open)
  const claims = useClaims(app.workspace.root)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => { if (open) { setQuery(""); setActive(0) } }, [open])

  const items = useMemo<Item[]>(() => {
    const done = (fn: () => void) => () => { onClose(); fn() }
    const base: Item[] = [
      { id: "new", label: t("claimForm.title"), hint: `${mod}N`, icon: "plus", run: done(app.newClaim) },
      ...NAV.map((nav) => ({ id: nav.route, label: t(nav.label), hint: `${mod}${nav.key}`, icon: nav.icon, run: done(() => app.navigate(nav.route)) })),
      { id: "settings", label: t("nav.settings"), hint: `${mod},`, icon: "settings" as IconName, run: done(() => app.navigate("settings")) },
      { id: "theme", label: `${t("settings.appearance")}: ${app.theme.pref === "dark" ? t("settings.light") : t("settings.dark")}`, icon: app.theme.pref === "dark" ? "sun" : "moon", run: done(() => app.theme.set(app.theme.pref === "dark" ? "light" : "dark", { x: innerWidth / 2, y: innerHeight / 3 })) },
      { id: "lang", label: app.lang === "tr" ? "Dil: English" : "Language: Türkçe", hint: app.lang === "tr" ? "EN" : "TR", icon: "globe", run: done(() => app.setLang(app.lang === "tr" ? "en" : "tr")) },
      { id: "switch", label: t("nav.switchWorkspace"), icon: "folder", run: done(app.closeWorkspace) },
    ]
    const claimItems: Item[] = (claims.data ?? []).map((claim) => ({ id: `claim-${claim.id}`, label: claim.title, hint: claim.id, icon: "claims" as IconName, run: done(() => { app.selectClaim(claim.id); app.navigate("claims") }) }))
    const q = query.trim().toLowerCase()
    const matches = [...base, ...claimItems].filter((item) => !q || item.label.toLowerCase().includes(q) || item.hint?.toLowerCase().includes(q))
    if (q) matches.push({ id: "run-in-console", label: `${t("palette.run")}: ${query.trim()}`, icon: "console", run: done(() => app.runInConsole(query.trim())) })
    return matches.slice(0, 50)
  }, [query, claims.data, app, t, onClose])

  useEffect(() => { setActive((value) => Math.min(value, Math.max(0, items.length - 1))) }, [items.length])
  useEffect(() => { list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }) }, [active])

  if (!mounted) return null
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => (value + 1) % Math.max(1, items.length)) }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => (value - 1 + items.length) % Math.max(1, items.length)) }
    else if (event.key === "Enter") { event.preventDefault(); items[active]?.run() }
    else if (event.key === "Escape") { event.preventDefault(); onClose() }
  }
  return createPortal(
    <>
      <div className={`scrim ${closing ? "closing" : ""}`} onClick={onClose} />
      <div className={`palette ${closing ? "closing" : ""}`} role="dialog" aria-modal="true" onKeyDown={onKeyDown}>
        <div className="search"><Icon name="search" /><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setActive(0) }} placeholder={t("palette.placeholder")} spellCheck={false} /></div>
        {items.length === 0 ? <div className="none">{t("palette.noResults")}</div> : (
          <ul ref={list} role="listbox">
            {items.map((item, index) => (
              <li key={item.id}>
                <button data-index={index} role="option" aria-selected={index === active} onMouseMove={() => setActive(index)} onClick={item.run}>
                  <Icon name={item.icon} size={16} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>{item.hint && <span className="kbd">{item.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>,
    document.body,
  )
}

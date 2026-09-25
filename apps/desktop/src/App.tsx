import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { AppContext, NAV, type AppApi, type RecentWorkspace, type Route, type Workspace } from "./lib/app.ts"
import { detectLang, LangContext, translate, type Lang } from "./lib/i18n.ts"
import { useTheme } from "./lib/theme.ts"
import { readPref, writePref } from "./lib/storage.ts"
import { clearCache } from "./lib/query.ts"
import { Sidebar } from "./components/Sidebar.tsx"
import { Palette } from "./components/Palette.tsx"
import { Toasts, useToasts } from "./components/Overlay.tsx"
import { Welcome } from "./views/Welcome.tsx"
import { Overview } from "./views/Overview.tsx"
import { NewClaimSheet } from "./views/NewClaim.tsx"
import { ErrorBoundary } from "./components/ErrorBoundary.tsx"

// Secondary screens are split out so the first paint only pays for what it shows.
const Claims = lazy(() => import("./views/Claims.tsx").then((m) => ({ default: m.Claims })))
const Branches = lazy(() => import("./views/Branches.tsx").then((m) => ({ default: m.Branches })))
const Health = lazy(() => import("./views/Health.tsx").then((m) => ({ default: m.Health })))
const Console = lazy(() => import("./views/Console.tsx").then((m) => ({ default: m.Console })))
const Providers = lazy(() => import("./views/Providers.tsx").then((m) => ({ default: m.Providers })))
const Settings = lazy(() => import("./views/Settings.tsx").then((m) => ({ default: m.Settings })))

const preload = () => { void import("./views/Claims.tsx"); void import("./views/Branches.tsx"); void import("./views/Health.tsx"); void import("./views/Console.tsx"); void import("./views/Providers.tsx"); void import("./views/Settings.tsx") }

export function App() {
  const theme = useTheme()
  const [lang, setLangState] = useState<Lang>(() => readPref<Lang>("lang", detectLang()))
  // Stored preferences are untrusted input: a stale or hand-edited value must not crash the first render.
  const [workspace, setWorkspace] = useState<Workspace | null>(() => validWorkspace(readPref<unknown>("workspace", null)))
  const [recent, setRecent] = useState<RecentWorkspace[]>(() => { const rows = readPref<unknown>("recent", []); return Array.isArray(rows) ? rows.filter((row): row is RecentWorkspace => validWorkspace(row) !== null && typeof (row as RecentWorkspace).at === "number") : [] })
  const [route, setRoute] = useState<Route>(() => { const value = readPref<unknown>("route", "overview"); return ROUTES.includes(value as Route) ? value as Route : "overview" })
  const [selectedClaim, setSelectedClaim] = useState<string | null>(null)
  const [palette, setPalette] = useState(false)
  const [newClaim, setNewClaim] = useState(false)
  const [pendingConsole, setPendingConsole] = useState<string | null>(null)
  const [sidebarPinnedCollapsed, setSidebarPinnedCollapsed] = useState<boolean>(() => readPref<unknown>("sidebarCollapsed", false) === true)
  const narrow = useNarrowWindow()
  const sidebarCollapsed = sidebarPinnedCollapsed || narrow
  const toggleSidebar = useCallback(() => setSidebarPinnedCollapsed((value) => { writePref("sidebarCollapsed", !value); return !value }), [])
  const { toasts, push } = useToasts()

  useEffect(() => { document.documentElement.lang = lang }, [lang])
  useEffect(() => { if (workspace) { const id = window.requestIdleCallback?.(preload) ?? window.setTimeout(preload, 300); return () => { window.cancelIdleCallback?.(id as number) } } }, [workspace])

  const setLang = useCallback((next: Lang) => { setLangState(next); writePref("lang", next) }, [])
  const navigate = useCallback((next: Route) => { setRoute(next); writePref("route", next) }, [])
  const openWorkspace = useCallback((next: Workspace) => {
    clearCache()
    setSelectedClaim(null)
    setWorkspace(next); writePref("workspace", next)
    setRecent((rows) => { const list = [{ ...next, at: Date.now() }, ...rows.filter((row) => row.root !== next.root)].slice(0, 8); writePref("recent", list); return list })
    navigate("overview")
  }, [navigate])
  const closeWorkspace = useCallback(() => { setWorkspace(null); writePref("workspace", null); clearCache() }, [])
  const forget = useCallback((root: string) => setRecent((rows) => { const list = rows.filter((row) => row.root !== root); writePref("recent", list); return list }), [])

  const api = useMemo<AppApi | null>(() => workspace && ({
    workspace, route, navigate, selectedClaim, selectClaim: setSelectedClaim, toast: push,
    newClaim: () => setNewClaim(true),
    runInConsole: (command) => { setPendingConsole(command); navigate("console") },
    pendingConsole, consumeConsole: () => setPendingConsole(null),
    closeWorkspace, recent, openWorkspace, sidebar: { collapsed: sidebarCollapsed, toggle: toggleSidebar }, lang, setLang, theme: { pref: theme.pref, set: theme.set },
  }), [workspace, route, navigate, selectedClaim, push, pendingConsole, closeWorkspace, recent, openWorkspace, sidebarCollapsed, toggleSidebar, lang, setLang, theme.pref, theme.set])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || !workspace) return
      const nav = NAV.find((item) => item.key === event.key)
      if (nav) { event.preventDefault(); navigate(nav.route); return }
      if (event.key === "k") { event.preventDefault(); setPalette((value) => !value) }
      else if (event.key === "n") { event.preventDefault(); setNewClaim(true) }
      else if (event.key === ",") { event.preventDefault(); navigate("settings") }
      else if (event.key === "b") { event.preventDefault(); toggleSidebar() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [workspace, navigate, toggleSidebar])

  return (
    <LangContext.Provider value={lang}>
      {!api ? (
        <Welcome recent={recent} onOpen={openWorkspace} onForget={forget} toast={push} theme={{ pref: theme.pref, set: theme.set }} />
      ) : (
        <AppContext.Provider value={api}>
          <div className={`shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
            <div className="titlebar-drag" data-tauri-drag-region />
            <Sidebar onPalette={() => setPalette(true)} />
            <main className="main">
              <ErrorBoundary key={route} title={translate(lang, "common.error")} detail={translate(lang, "error.viewCrashed")} resetLabel={translate(lang, "nav.overview")} onReset={() => navigate("overview")}>
                <Suspense fallback={null}>
                  <Screen route={route} />
                </Suspense>
              </ErrorBoundary>
            </main>
          </div>
          <Palette open={palette} onClose={() => setPalette(false)} />
          <NewClaimSheet open={newClaim} onClose={() => setNewClaim(false)} />
        </AppContext.Provider>
      )}
      <Toasts toasts={toasts} />
    </LangContext.Provider>
  )
}

function Screen({ route }: { route: Route }) {
  if (route === "claims") return <div key={route} className="view-enter" style={{ height: "100%" }}><Claims /></div>
  if (route === "console") return <div key={route} className="view-enter" style={{ height: "100%" }}><Console /></div>
  return (
    <div key={route} className="page view-enter">
      {route === "overview" && <Overview />}
      {route === "branches" && <Branches />}
      {route === "health" && <Health />}
      {route === "providers" && <Providers />}
      {route === "settings" && <Settings />}
    </div>
  )
}

const ROUTES: Route[] = ["overview", "claims", "branches", "health", "providers", "console", "settings"]
function validWorkspace(value: unknown): Workspace | null {
  if (!value || typeof value !== "object") return null
  const { root, name } = value as Partial<Workspace>
  return typeof root === "string" && root.length > 0 && typeof name === "string" ? { root, name } : null
}

/** Narrow windows get the icon rail automatically, without changing the saved preference. */
function useNarrowWindow() {
  const query = "(max-width: 860px)"
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query), onChange = () => setNarrow(media.matches)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])
  return narrow
}

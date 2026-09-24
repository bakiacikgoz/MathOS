import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { AppContext, NAV, type AppApi, type RecentWorkspace, type Route, type Workspace } from "./lib/app.ts"
import { detectLang, LangContext, type Lang } from "./lib/i18n.ts"
import { useTheme } from "./lib/theme.ts"
import { readPref, writePref } from "./lib/storage.ts"
import { clearCache } from "./lib/query.ts"
import { Sidebar } from "./components/Sidebar.tsx"
import { Palette } from "./components/Palette.tsx"
import { Toasts, useToasts } from "./components/Overlay.tsx"
import { Welcome } from "./views/Welcome.tsx"
import { Overview } from "./views/Overview.tsx"
import { NewClaimSheet } from "./views/NewClaim.tsx"

// Secondary screens are split out so the first paint only pays for what it shows.
const Claims = lazy(() => import("./views/Claims.tsx").then((m) => ({ default: m.Claims })))
const Branches = lazy(() => import("./views/Branches.tsx").then((m) => ({ default: m.Branches })))
const Health = lazy(() => import("./views/Health.tsx").then((m) => ({ default: m.Health })))
const Console = lazy(() => import("./views/Console.tsx").then((m) => ({ default: m.Console })))
const Settings = lazy(() => import("./views/Settings.tsx").then((m) => ({ default: m.Settings })))

const preload = () => { void import("./views/Claims.tsx"); void import("./views/Branches.tsx"); void import("./views/Health.tsx"); void import("./views/Console.tsx"); void import("./views/Settings.tsx") }

export function App() {
  const theme = useTheme()
  const [lang, setLangState] = useState<Lang>(() => readPref<Lang>("lang", detectLang()))
  const [workspace, setWorkspace] = useState<Workspace | null>(() => readPref<Workspace | null>("workspace", null))
  const [recent, setRecent] = useState<RecentWorkspace[]>(() => readPref("recent", []))
  const [route, setRoute] = useState<Route>(() => readPref<Route>("route", "overview"))
  const [selectedClaim, setSelectedClaim] = useState<string | null>(null)
  const [palette, setPalette] = useState(false)
  const [newClaim, setNewClaim] = useState(false)
  const [pendingConsole, setPendingConsole] = useState<string | null>(null)
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
    closeWorkspace, lang, setLang, theme: { pref: theme.pref, set: theme.set },
  }), [workspace, route, navigate, selectedClaim, push, pendingConsole, closeWorkspace, lang, setLang, theme.pref, theme.set])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || !workspace) return
      const nav = NAV.find((item) => item.key === event.key)
      if (nav) { event.preventDefault(); navigate(nav.route); return }
      if (event.key === "k") { event.preventDefault(); setPalette((value) => !value) }
      else if (event.key === "n") { event.preventDefault(); setNewClaim(true) }
      else if (event.key === ",") { event.preventDefault(); navigate("settings") }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [workspace, navigate])

  return (
    <LangContext.Provider value={lang}>
      {!api ? (
        <Welcome recent={recent} onOpen={openWorkspace} onForget={forget} toast={push} theme={{ pref: theme.pref, set: theme.set }} />
      ) : (
        <AppContext.Provider value={api}>
          <div className="shell">
            <div className="titlebar-drag" data-tauri-drag-region />
            <Sidebar onPalette={() => setPalette(true)} />
            <main className="main">
              <Suspense fallback={null}>
                <Screen route={route} />
              </Suspense>
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
      {route === "settings" && <Settings />}
    </div>
  )
}

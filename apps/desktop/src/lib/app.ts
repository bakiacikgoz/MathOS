import { createContext, useContext } from "react"
import type { Lang, MessageKey } from "./i18n.ts"
import type { ThemePref } from "./theme.ts"

export type Route = "overview" | "assistant" | "claims" | "branches" | "graph" | "literature" | "research" | "memory" | "reports" | "health" | "providers" | "console" | "settings"
export interface Workspace { root: string; name: string }
export interface RecentWorkspace extends Workspace { at: number }

export interface StatusProjection {
  projectName: string
  workspaceRoot: string
  mainObjective: { id: string; title: string; status: string } | null
  research: { verified: number; informal: number; conjectures: number; blocked: number; totalClaims: number }
  branch: { id: string; name: string; slug?: string; status: string; staleBase?: boolean } | null
  integrity: { database: string; eventLog: string; initialized: boolean }
}
export interface Claim { id: string; kind: string; title: string; naturalStatement: string; status: string; branchId: string; createdBy: string; createdAt: string; updatedAt: string }
export interface Branch { id: string; name: string; slug: string; purpose: string | null; status: string; isCurrent: boolean; staleBase: boolean; createdAt: string }
export interface DoctorReport { ok: boolean; checks: Array<{ name: string; status: "PASS" | "WARN" | "FAIL"; detail: string }>; mathosVersion?: string }

export interface AppApi {
  workspace: Workspace
  route: Route
  navigate: (route: Route) => void
  selectedClaim: string | null
  selectClaim: (id: string | null) => void
  toast: (text: string, kind?: "ok" | "error") => void
  newClaim: () => void
  runInConsole: (command: string) => void
  pendingConsole: string | null
  consumeConsole: () => void
  closeWorkspace: () => void
  recent: RecentWorkspace[]
  openWorkspace: (workspace: Workspace) => void
  sidebar: { collapsed: boolean; toggle: () => void }
  lang: Lang
  setLang: (lang: Lang) => void
  theme: { pref: ThemePref; set: (pref: ThemePref, origin?: { x: number; y: number }) => void }
}

export const AppContext = createContext<AppApi | null>(null)
export function useApp(): AppApi {
  const value = useContext(AppContext)
  if (!value) throw new Error("AppContext missing")
  return value
}

export const NAV: Array<{ route: Route; label: MessageKey; icon: "overview" | "chat" | "claims" | "graph" | "book" | "sparkles" | "branch" | "file"; key: string }> = [
  { route: "overview", label: "nav.overview", icon: "overview", key: "1" },
  { route: "assistant", label: "nav.assistant", icon: "chat", key: "2" },
  { route: "claims", label: "nav.claims", icon: "claims", key: "3" },
  { route: "graph", label: "nav.graph", icon: "graph", key: "4" },
  { route: "literature", label: "nav.literature", icon: "book", key: "5" },
  { route: "research", label: "nav.research", icon: "sparkles", key: "6" },
  { route: "branches", label: "nav.branches", icon: "branch", key: "7" },
  { route: "reports", label: "nav.reports", icon: "file", key: "8" },
]

/** How the app is set up rather than the research itself: these are tabs of Settings, not sidebar items. */
export const SETTINGS_TABS: Array<{ route: Route; label: MessageKey; icon: "settings" | "plug" | "brain" | "health" | "console" }> = [
  { route: "settings", label: "settings.general", icon: "settings" },
  { route: "providers", label: "nav.providers", icon: "plug" },
  { route: "memory", label: "nav.memory", icon: "brain" },
  { route: "health", label: "nav.health", icon: "health" },
  { route: "console", label: "nav.console", icon: "console" },
]
export const isSettingsRoute = (route: Route) => SETTINGS_TABS.some((tab) => tab.route === route)

export const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+"

import { createContext, useContext } from "react"
import type { Lang, MessageKey } from "./i18n.ts"
import type { ThemePref } from "./theme.ts"

export type Route = "overview" | "claims" | "branches" | "health" | "providers" | "console" | "settings"
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

export const NAV: Array<{ route: Route; label: MessageKey; icon: "overview" | "claims" | "branch" | "health" | "plug" | "console"; key: string }> = [
  { route: "overview", label: "nav.overview", icon: "overview", key: "1" },
  { route: "claims", label: "nav.claims", icon: "claims", key: "2" },
  { route: "branches", label: "nav.branches", icon: "branch", key: "3" },
  { route: "health", label: "nav.health", icon: "health", key: "4" },
  { route: "providers", label: "nav.providers", icon: "plug", key: "5" },
  { route: "console", label: "nav.console", icon: "console", key: "6" },
]

export const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+"

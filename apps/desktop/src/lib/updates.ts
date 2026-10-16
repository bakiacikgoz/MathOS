import { useSyncExternalStore } from "react"
import { isTauri, openExternal, runJson } from "./bridge.ts"
import { readPref, writePref } from "./storage.ts"

/** `mathos update check --json` (packages/update/src/release.ts). */
export interface UpdateStatus { currentVersion: string; latestVersion: string; available: boolean; url: string; publishedAt: string | null; notes: string; checkedAt: string }
export type UpdatePhase = "idle" | "checking" | "current" | "available" | "downloading" | "installing" | "failed"
export interface UpdateState { phase: UpdatePhase; status: UpdateStatus | null; error: unknown; dismissed: string | null }

// Update checks run before any workspace is open; they only read the published releases.
const CWD = "/"
const RECHECK_MS = 12 * 60 * 60 * 1000
/** Only the Windows desktop app has a setup in each release; elsewhere the release page is opened instead. */
export const canInstallInApp = isTauri && typeof navigator !== "undefined" && /Win/.test(navigator.platform)

let state: UpdateState = { phase: "idle", status: null, error: null, dismissed: readPref<string | null>("updates.dismissed", null) }
const listeners = new Set<() => void>()
const set = (next: Partial<UpdateState>) => { state = { ...state, ...next }; for (const listener of listeners) listener() }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export const useUpdates = () => useSyncExternalStore(subscribe, () => state)
export const autoCheckEnabled = () => readPref<unknown>("updates.auto", true) !== false
export const setAutoCheck = (on: boolean) => { writePref("updates.auto", on); if (on) void checkForUpdates() }

/** Asks the published releases whether a newer MathOS is out. A failed automatic check stays quiet. */
export async function checkForUpdates(options: { manual?: boolean } = {}): Promise<UpdateStatus | null> {
  if (state.phase === "checking" || state.phase === "downloading" || state.phase === "installing") return state.status
  const before = state.phase
  set({ phase: "checking", error: null })
  try {
    const status = await runJson<UpdateStatus>(CWD, ["update", "check"])
    set({ phase: status.available ? "available" : "current", status })
    return status
  } catch (error) {
    // A quiet check that fails leaves things as they were (an earlier "available" stays).
    set(options.manual ? { phase: "failed", error } : { phase: before })
    return null
  }
}

/** Checks a few seconds after launch and twice a day while the app stays open, unless turned off in Settings. */
export function startAutoCheck(): () => void {
  if (!isTauri) return () => {}
  const run = () => { if (autoCheckEnabled()) void checkForUpdates() }
  const first = window.setTimeout(run, 8_000), again = window.setInterval(run, RECHECK_MS)
  return () => { window.clearTimeout(first); window.clearInterval(again) }
}

/** "Later": hides the notice for this version; Settings still shows it. */
export function dismissUpdate() {
  const version = state.status?.latestVersion ?? null
  writePref("updates.dismissed", version); set({ dismissed: version })
}

/**
 * Windows: downloads the new setup, checks it against the release's SHA256SUMS, then hands it to the app, which closes,
 * installs it without questions (the same per-user installation) and opens the new version.
 * Elsewhere: opens the release page.
 */
export async function installUpdate(): Promise<void> {
  const status = state.status
  if (!status?.available) return
  if (!canInstallInApp) { await openExternal(status.url); return }
  set({ phase: "downloading", error: null })
  try {
    const download = await runJson<{ path: string; version: string }>(CWD, ["update", "download", "--desktop", status.latestVersion])
    set({ phase: "installing" })
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("install_update", { installer: download.path })
  } catch (error) {
    set({ phase: "failed", error })
  }
}

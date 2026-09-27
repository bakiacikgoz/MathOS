import { useEffect } from "react"
import { runJson } from "./bridge.ts"
import { invalidate, useQuery } from "./query.ts"

// Lean and Mathlib are installed once per computer, in the background, by the host as soon as the app starts.
// This is the app's view of that install: one shared status, followed closely while it runs.

export type LeanStep = "git" | "elan" | "project" | "toolchain" | "mathlib" | "cache" | "build"
export const LEAN_STEPS: LeanStep[] = ["git", "elan", "project", "toolchain", "mathlib", "cache", "build"]
export type LeanBlocker = "LEAN_INSTALL_GIT_MISSING" | "LEAN_INSTALL_DISK_FULL"

export interface LeanStatus {
  pinnedToolchain: string
  git: boolean
  elan: string | null
  toolchainInstalled: boolean
  runtimeRoot: string
  mathlibFetched: boolean
  mathlibBuilt: boolean
  ready: boolean
  freeBytes: number | null
  requiredBytes: number
  /** The running install, if any. */
  job: string | null
  progress: { step: LeanStep | null; percent: number } | null
  /** The latest install, running or finished, to show its steps. */
  lastJob: string | null
  lastError: { code: string; message: string } | null
  /** A dropped connection: the host tries again by itself. */
  retrying: boolean
  /** Another MathOS process (a terminal) is installing: shown as installing, without its steps. */
  elsewhere: number | null
  blocker: LeanBlocker | null
  autoInstall: boolean
}

export const LEAN_STATUS_KEY = "lean|runtime"

/** The shared Lean status; polled every second or two while the install runs, twice a minute otherwise. */
export function useLeanStatus(root: string) {
  const status = useQuery(LEAN_STATUS_KEY, () => runJson<LeanStatus>(root, ["lean", "status"]), 1_500)
  const busy = Boolean(status.data?.job || status.data?.retrying || status.data?.elsewhere)
  useEffect(() => {
    const timer = window.setInterval(() => invalidate(LEAN_STATUS_KEY), busy ? 1_500 : 30_000)
    return () => window.clearInterval(timer)
  }, [busy])
  return status
}

/** What stands between the user and a working Lean, in the order it matters. */
export type LeanPhase = "loading" | "ready" | "installing" | "retrying" | "blocked" | "failed" | "idle"
export function leanPhase(status: LeanStatus | undefined): LeanPhase {
  if (!status) return "loading"
  if (status.ready) return "ready"
  if (status.job || status.elsewhere) return "installing"
  if (status.retrying) return "retrying"
  if (status.blocker) return "blocked"
  if (status.lastError) return "failed"
  return "idle"
}

export const leanVersion = (status: Pick<LeanStatus, "pinnedToolchain"> | undefined) => status?.pinnedToolchain.replace(/^.*:v?/, "") ?? ""

/** Starts the install by hand (after a failure, a cancel, or with automatic install turned off). */
export async function startLeanInstall(root: string): Promise<string> {
  const started = await runJson<{ job: string }>(root, ["lean", "install", "--background"])
  invalidate(LEAN_STATUS_KEY)
  return started.job
}

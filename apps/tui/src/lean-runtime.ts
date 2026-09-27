import { tmpdir } from "node:os"
import { join } from "node:path"
import { installLean, leanInstallHolder, leanInstallProgress, leanInstallStatus, LeanInstallError, NativeLeanAdapter, type LeanInstallStatus } from "@mathos/lean"
import { listJobs, pollJob, startJob } from "./jobs.ts"

// The shared Lean runtime is installed once per computer, in the background, as soon as the desktop app starts:
// formal work should not wait for the user to find a setup button. A dropped connection is retried on its own.

export const LEAN_INSTALL_KIND = "lean-install"
const KEY = "lean-install"
const RETRY_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000]
let retries = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null

/** Starts the install (single-flight: a running one is returned instead). */
export function startLeanInstall(options: { retryOnNetwork?: boolean } = {}): { id: string; reused: boolean } {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  return startJob(LEAN_INSTALL_KIND, KEY, async (emit, signal) => {
    try {
      const status = await installLean((event) => emit(event as unknown as Record<string, unknown>), { signal })
      retries = 0
      return status
    } catch (error) {
      if (options.retryOnNetwork && !signal.aborted && error instanceof LeanInstallError && error.code === "LEAN_INSTALL_NETWORK" && retries < RETRY_MS.length) {
        const delay = RETRY_MS[retries++]!
        emit({ type: "retry", at: Date.now() + delay })
        retryTimer = setTimeout(() => { retryTimer = null; startLeanInstall(options) }, delay)
      }
      throw error
    }
  })
}

/** Why the install cannot start by itself, when it cannot; the app shows this instead of a progress bar. */
export function leanInstallBlocker(status: LeanInstallStatus): "LEAN_INSTALL_GIT_MISSING" | "LEAN_INSTALL_DISK_FULL" | null {
  if (status.ready) return null
  if (!status.mathlibFetched && !status.git) return "LEAN_INSTALL_GIT_MISSING"
  if (!status.mathlibFetched && status.freeBytes !== null && status.freeBytes < status.requiredBytes) return "LEAN_INSTALL_DISK_FULL"
  return null
}

/** Called when the desktop host starts: installs what is missing, unless it is all there or cannot start. */
export function autoInstallLean(env: Record<string, string | undefined> = process.env): string | null {
  if (env.MATHOS_LEAN_AUTO_INSTALL === "0") return null
  const status = leanInstallStatus()
  if (status.ready || leanInstallBlocker(status) || leanInstallHolder()) return null
  return startLeanInstall({ retryOnNetwork: true }).id
}

/** The install as the app shows it: what is there, the running or last job, and what blocks it. */
export function leanRuntimeState() {
  const status = leanInstallStatus()
  const jobs = listJobs(LEAN_INSTALL_KIND).filter((job) => job.key === KEY).sort((a, b) => b.startedAt - a.startedAt)
  const running = jobs.find((job) => job.state === "running") ?? null, last = jobs[0] ?? null
  return {
    ...status,
    job: running?.id ?? null,
    progress: running ? leanInstallProgress(pollJob(running.id).events) : null,
    lastJob: last?.id ?? null,
    lastError: !status.ready && last?.state === "failed" ? last.error : null,
    retrying: retryTimer !== null,
    /** Another MathOS process (a terminal's `lean install`) is installing; this one shows it without its steps. */
    elsewhere: running ? null : leanInstallHolder(),
    blocker: running ? null : leanInstallBlocker(status),
    autoInstall: process.env.MATHOS_LEAN_AUTO_INSTALL !== "0",
  }
}

/** The last step of setup: Lean checks a real Mathlib proof in the shared runtime, so "ready" means it works. */
export async function leanSelfTest(): Promise<{ ok: boolean; ms: number; leanVersion: string | null; detail: string | null }> {
  const status = leanInstallStatus()
  if (!status.ready) return { ok: false, ms: 0, leanVersion: null, detail: "LEAN_NOT_READY" }
  const started = Date.now(), adapter = new NativeLeanAdapter()
  const proof = "theorem mathos_self_test (n : ℕ) : ∑ i ∈ Finset.range n, (2 * i + 1) = n ^ 2 := by\n  induction n with\n  | zero => simp\n  | succ n ih => rw [Finset.sum_range_succ, ih]; ring\n"
  const tmpDir = join(tmpdir(), "mathos-self-test")
  const result = await adapter.checkProof(proof, { workspaceRoot: status.runtimeRoot, tmpDir })
  const ok = result.result === "KERNEL_ACCEPTED"
  return { ok, ms: Date.now() - started, leanVersion: result.leanVersion, detail: ok ? null : result.diagnostics.map((item) => item.message).join("\n").slice(0, 600) }
}

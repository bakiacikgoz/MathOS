import { useEffect, useRef, useState } from "react"
import { runJson } from "./bridge.ts"

// A job runs inside the desktop host (Lean install, an assistant turn); the app polls it for new events.
export type JobState = "running" | "done" | "failed" | "cancelled"
export interface JobEvent { seq: number; at: number; type?: string; [key: string]: unknown }
export interface JobSnapshot { id: string; kind: string; state: JobState; startedAt: number; finishedAt: number | null; events: JobEvent[]; next: number; result: unknown; error: { code: string; message: string } | null }

export interface JobView { id: string; state: JobState; events: JobEvent[]; startedAt: number; finishedAt: number | null; result: unknown; error: JobSnapshot["error"] }

/** Follows a job until it ends, accumulating its events; polls quickly while it is busy and backs off when idle. */
export function useJob(root: string, id: string | null, onEvent?: (event: JobEvent) => void): JobView | null {
  const [view, setView] = useState<JobView | null>(null)
  const listener = useRef(onEvent)
  listener.current = onEvent
  useEffect(() => {
    if (!id) { setView(null); return }
    let alive = true, since = 0, delay = 250, timer = 0
    setView(null)
    const tick = async () => {
      try {
        const snapshot = await runJson<JobSnapshot>(root, ["job", "poll", id, "--since", String(since)])
        if (!alive) return
        since = snapshot.next
        for (const event of snapshot.events) listener.current?.(event)
        setView((previous) => ({ id, state: snapshot.state, events: snapshot.events.length ? [...(previous?.id === id ? previous.events : []), ...snapshot.events].slice(-2000) : previous?.id === id ? previous.events : [], startedAt: snapshot.startedAt, finishedAt: snapshot.finishedAt, result: snapshot.result, error: snapshot.error }))
        if (snapshot.state !== "running") return
        delay = snapshot.events.length ? 250 : Math.min(delay * 1.4, 1500)
      } catch (error) {
        if (!alive) return
        setView((previous) => ({ id, state: "failed", events: previous?.events ?? [], startedAt: previous?.startedAt ?? Date.now(), finishedAt: Date.now(), result: null, error: { code: "JOB_LOST", message: error instanceof Error ? error.message : String(error) } }))
        return
      }
      timer = window.setTimeout(() => void tick(), delay)
    }
    void tick()
    return () => { alive = false; window.clearTimeout(timer) }
  }, [root, id])
  return view
}

export const cancelJob = (root: string, id: string) => runJson<{ cancelled: boolean }>(root, ["job", "cancel", id])

/** Seconds since `from`, ticking once a second while `running`. */
export function useElapsed(from: number | null, running: boolean, until: number | null = null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  if (!from) return 0
  return Math.max(0, Math.floor(((running ? now : until ?? now) - from) / 1000))
}

export function formatDuration(seconds: number, lang: "tr" | "en"): string {
  if (seconds < 60) return lang === "tr" ? `${seconds} sn` : `${seconds}s`
  const minutes = Math.floor(seconds / 60), rest = seconds % 60
  return lang === "tr" ? `${minutes} dk ${rest} sn` : `${minutes}m ${rest}s`
}

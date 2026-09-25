// Long-running work (installing Lean, an assistant turn) runs as a job inside the desktop host, which is a long-lived
// process: the request that starts it returns at once, and the app polls for new events. A one-shot CLI process
// cannot keep a job alive after it exits, so there the same work runs in the foreground instead.

export type JobState = "running" | "done" | "failed" | "cancelled"
export interface JobEvent { seq: number; at: number; [key: string]: unknown }
export interface JobSnapshot { schemaVersion: "mathos.job.v1"; id: string; kind: string; key: string | null; state: JobState; startedAt: number; finishedAt: number | null; events: JobEvent[]; next: number; result: unknown; error: { code: string; message: string } | null }

interface Job { id: string; kind: string; key: string | null; state: JobState; startedAt: number; finishedAt: number | null; events: JobEvent[]; result: unknown; error: { code: string; message: string } | null; controller: AbortController }

const jobs = new Map<string, Job>()
const MAX_EVENTS = 5_000
const KEEP_FINISHED_MS = 30 * 60_000
let counter = 0

/** True inside the desktop host, where a job outlives the request that started it. */
export const jobsCanRunInBackground = () => (globalThis as { __mathosDesktopHost?: boolean }).__mathosDesktopHost === true

function prune(now = Date.now()) {
  for (const [id, job] of jobs) if (job.finishedAt && now - job.finishedAt > KEEP_FINISHED_MS) jobs.delete(id)
}

/** Starts a job; a `key` makes it single-flight (starting it again while one runs returns the running one). */
export function startJob(kind: string, key: string | null, work: (emit: (event: Record<string, unknown>) => void, signal: AbortSignal) => Promise<unknown>): { id: string; reused: boolean } {
  prune()
  if (key) for (const job of jobs.values()) if (job.key === key && job.state === "running") return { id: job.id, reused: true }
  const job: Job = { id: `job-${Date.now().toString(36)}-${(++counter).toString(36)}`, kind, key, state: "running", startedAt: Date.now(), finishedAt: null, events: [], result: null, error: null, controller: new AbortController() }
  jobs.set(job.id, job)
  let seq = 0
  const emit = (event: Record<string, unknown>) => {
    job.events.push({ ...event, seq: seq++, at: Date.now() })
    if (job.events.length > MAX_EVENTS) job.events.splice(0, job.events.length - MAX_EVENTS)
  }
  void work(emit, job.controller.signal).then(
    (result) => { job.result = result ?? null; job.state = job.controller.signal.aborted ? "cancelled" : "done" },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error), code = /^([A-Z][A-Z0-9_]{3,}):/.exec(message)?.[1] ?? "JOB_FAILED"
      job.error = { code, message: message.replace(/^[A-Z][A-Z0-9_]{3,}:\s*/, "") }
      job.state = job.controller.signal.aborted || code.endsWith("_CANCELLED") ? "cancelled" : "failed"
    },
  ).finally(() => { job.finishedAt = Date.now() })
  return { id: job.id, reused: false }
}

export function pollJob(id: string, since = 0): JobSnapshot {
  const job = jobs.get(id)
  if (!job) throw new Error(`JOB_NOT_FOUND: ${id}`)
  const events = job.events.filter((event) => event.seq >= since)
  const next = job.events.length ? job.events[job.events.length - 1]!.seq + 1 : since
  return { schemaVersion: "mathos.job.v1", id: job.id, kind: job.kind, key: job.key, state: job.state, startedAt: job.startedAt, finishedAt: job.finishedAt, events, next: Math.max(next, since), result: job.result, error: job.error }
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id)
  if (!job || job.state !== "running") return false
  job.controller.abort()
  return true
}

export function listJobs(kind?: string): Array<Omit<JobSnapshot, "events">> {
  return [...jobs.values()].filter((job) => !kind || job.kind === kind).map((job) => ({ schemaVersion: "mathos.job.v1" as const, id: job.id, kind: job.kind, key: job.key, state: job.state, startedAt: job.startedAt, finishedAt: job.finishedAt, next: job.events.length, result: job.result, error: job.error }))
}

/** Test hook: forget every job. */
export function resetJobs() { for (const job of jobs.values()) job.controller.abort(); jobs.clear() }

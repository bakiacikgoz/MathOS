import { readFileSync } from "node:fs"
import type { ResearchEvent } from "@mathos/domain"
import { nowIso } from "@mathos/shared"
import { EventLog } from "./jsonl.ts"

export type EventProjectionPoint = "before_db_event" | "after_db_event" | "before_jsonl_append" | "after_jsonl_append"
export type EventProjectionStatus = "HEALTHY" | "EVENT_PROJECTION_DEGRADED"
export interface EventProjectionHealth { status: EventProjectionStatus; detail: string; eventCount: number; projectedCount: number }

interface CanonicalEvents {
  insert(workspaceId: string, event: ResearchEvent): void
  list(workspaceId: string): ResearchEvent[]
  projectionHealth(workspaceId: string): { status: string; detail: string } | null
  setProjectionHealth(workspaceId: string, status: string, detail: string, updatedAt: string): void
}

export class EventProjection {
  constructor(
    private readonly workspaceId: string,
    private readonly rows: CanonicalEvents,
    private readonly log: EventLog,
    private readonly hook?: (point: EventProjectionPoint, event: ResearchEvent) => void,
  ) {}

  record(event: ResearchEvent): void {
    this.hook?.("before_db_event", event)
    this.rows.insert(this.workspaceId, event)
    this.hook?.("after_db_event", event)
    try {
      this.hook?.("before_jsonl_append", event)
      this.log.append(event)
      this.hook?.("after_jsonl_append", event)
      this.rows.setProjectionHealth(this.workspaceId, "HEALTHY", "JSONL matches canonical SQLite events", nowIso())
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      this.rows.setProjectionHealth(this.workspaceId, "EVENT_PROJECTION_DEGRADED", `JSONL append failed after durable DB event: ${detail}`, nowIso())
    }
  }

  inspect(): EventProjectionHealth {
    const events = this.rows.list(this.workspaceId)
    const expected = events.map((event) => this.log.serialize(event)).join("\n") + (events.length ? "\n" : "")
    let actual = ""
    try { actual = readFileSync(this.log.path(), "utf8") } catch {}
    const projectedCount = actual.length === 0 ? 0 : actual.split("\n").filter(Boolean).length
    if (actual !== expected) {
      const previous = this.rows.projectionHealth(this.workspaceId)
      const drift = `SQLite has ${events.length} events; JSONL has ${projectedCount} lines or differing content`
      const detail = previous?.status === "EVENT_PROJECTION_DEGRADED" && previous.detail.includes("append failed")
        ? `${previous.detail}; ${drift}`
        : drift
      this.rows.setProjectionHealth(this.workspaceId, "EVENT_PROJECTION_DEGRADED", detail, nowIso())
      return { status: "EVENT_PROJECTION_DEGRADED", detail, eventCount: events.length, projectedCount }
    }
    const detail = "JSONL matches canonical SQLite events"
    this.rows.setProjectionHealth(this.workspaceId, "HEALTHY", detail, nowIso())
    return { status: "HEALTHY", detail, eventCount: events.length, projectedCount }
  }

  rebuild(): EventProjectionHealth {
    const events = this.rows.list(this.workspaceId)
    this.log.replace(events)
    return this.inspect()
  }
}

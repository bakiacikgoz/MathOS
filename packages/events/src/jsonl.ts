import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { ResearchEvent } from "@mathos/domain"
import { EventWriteFailed } from "@mathos/shared"

export class EventLog {
  constructor(private readonly filePath: string) {}

  ensure(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    if (!existsSync(this.filePath)) {
      appendFileSync(this.filePath, "", "utf8")
    }
  }

  append(event: ResearchEvent): void {
    try {
      this.ensure()
      const line = JSON.stringify({
        event_id: event.eventId,
        timestamp: event.timestamp,
        actor: event.actor,
        action: event.action,
        target: event.target,
        metadata: event.metadata,
      })
      appendFileSync(this.filePath, `${line}\n`, "utf8")
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new EventWriteFailed(reason, { path: this.filePath })
    }
  }

  path(): string {
    return this.filePath
  }
}

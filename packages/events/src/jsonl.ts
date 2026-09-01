import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs"
import { dirname } from "node:path"
import { randomUUID } from "node:crypto"
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
    this.synchronize(() => this.appendUnlocked(event))
  }

  /** Caller must hold synchronize(); exposed for commit+projection serialization. */
  appendUnlocked(event: ResearchEvent): void {
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
      const descriptor = openSync(this.filePath, "a")
      try { writeSync(descriptor, `${line}\n`, undefined, "utf8"); fsyncSync(descriptor) } finally { closeSync(descriptor) }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new EventWriteFailed(reason, { path: this.filePath })
    }
  }

  serialize(event: ResearchEvent): string {
    return JSON.stringify({
      event_id: event.eventId,
      timestamp: event.timestamp,
      actor: event.actor,
      action: event.action,
      target: event.target,
      metadata: event.metadata,
    })
  }

  replace(events: ResearchEvent[]): void {
    this.synchronize(() => this.replaceUnlocked(events))
  }

  /** Caller must hold synchronize(); exposed for projection snapshot+replace. */
  replaceUnlocked(events: ResearchEvent[]): void {
    this.ensure()
    const temporary = `${this.filePath}.tmp-${process.pid}-${randomUUID()}`
    try {
      writeFileSync(temporary, events.map((event) => this.serialize(event)).join("\n") + (events.length ? "\n" : ""), "utf8")
      const temporaryDescriptor = openSync(temporary, "r")
      try { fsyncSync(temporaryDescriptor) } finally { closeSync(temporaryDescriptor) }
      renameSync(temporary, this.filePath)
      const directoryDescriptor = openSync(dirname(this.filePath), "r")
      try { fsyncSync(directoryDescriptor) } finally { closeSync(directoryDescriptor) }
    } catch (error) {
      rmSync(temporary, { force: true })
      const reason = error instanceof Error ? error.message : String(error)
      throw new EventWriteFailed(reason, { path: this.filePath })
    }
  }

  synchronize<T>(work: () => T): T {
    const lock = `${this.filePath}.lock`
    this.ensure()
    const deadline = Date.now() + 30_000
    for (;;) {
      try {
        mkdirSync(lock)
        writeFileSync(`${lock}/owner`, String(process.pid), "utf8")
        break
      } catch {
        let owner: number | null = null
        try {
          owner = Number(readFileSync(`${lock}/owner`, "utf8"))
          if (Number.isInteger(owner) && owner > 0) process.kill(owner, 0)
        } catch {
          if (owner !== null) { rmSync(lock, { recursive: true, force: true }); continue }
          try {
            if (Date.now() - statSync(lock).mtimeMs > 5_000) { rmSync(lock, { recursive: true, force: true }); continue }
          } catch {}
        }
        if (Date.now() >= deadline) throw new EventWriteFailed("event projection lock timed out", { path: lock })
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
      }
    }
    try { return work() } finally { rmSync(lock, { recursive: true, force: true }) }
  }

  path(): string {
    return this.filePath
  }
}

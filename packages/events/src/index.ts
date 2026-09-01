import type { Actor, ResearchEvent } from "@mathos/domain"
import { createId, nowIso } from "@mathos/shared"

export function makeEvent(
  action: string,
  options: {
    actor?: Actor
    target?: string | null
    metadata?: Record<string, unknown>
  } = {},
): ResearchEvent {
  return {
    eventId: createId("evt"),
    timestamp: nowIso(),
    actor: options.actor ?? { type: "user", id: "local" },
    action,
    target: options.target ?? null,
    metadata: options.metadata ?? {},
  }
}

export { EventLog } from "./jsonl.ts"
export { EventProjection } from "./projection.ts"
export type { EventProjectionHealth, EventProjectionPoint, EventProjectionStatus } from "./projection.ts"

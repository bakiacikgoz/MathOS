import { afterEach, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { DatabaseClient, ContextItemRepository, ContextRevisionRepository } from "@mathos/storage"
import { MathematicalContextService } from "@mathos/core"

const clients: DatabaseClient[] = []
function service() {
  const client = new DatabaseClient(join(tmpdir(), `mathos-context-${crypto.randomUUID()}.sqlite`)); client.migrate(); clients.push(client)
  const events: Array<{ type: string; payload: Record<string, unknown> }> = []
  let id = 0
  return { service: new MathematicalContextService({ items: new ContextItemRepository(client.db), revisions: new ContextRevisionRepository(client.db), clock: { now: () => "2030-01-01T00:00:00.000Z" }, nextId: (prefix) => `${prefix}-${++id}`, writeEvent: (type, payload) => events.push({ type, payload }) }), events }
}
afterEach(() => { while (clients.length) clients.pop()!.close() })

describe("mathematical context registry", () => {
  test("resolves workspace to claim precedence with deterministic snapshots", () => {
    const { service: contexts } = service()
    for (const [scopeKind, scopeId, value] of [["WORKSPACE","W-1","workspace"],["BRANCH","B-1","branch"],["DOCUMENT","D-1","document"],["CLAIM","C-1","claim"]] as const) {
      const item = contexts.proposeItem({ workspaceId:"W-1", branchId:"B-1", scopeKind, scopeId, draft:{ kind:"SYMBOL", canonicalName:"x", displayText:value, normalizedValue:value, origin:"USER" } })
      contexts.applyProposal(item.id, item.revision)
    }
    const first = contexts.resolveSnapshot({ workspaceId:"W-1", branchId:"B-1", documentId:"D-1", claimId:"C-1" })
    const second = contexts.resolveSnapshot({ workspaceId:"W-1", branchId:"B-1", documentId:"D-1", claimId:"C-1" })
    expect(first.items.map((item) => item.displayText)).toEqual(["claim"])
    expect(first.snapshotHash).toBe(second.snapshotHash)
  })

  test("keeps model output proposed and rejects stale revisions", () => {
    const { service: contexts } = service()
    expect(() => contexts.proposeItem({ workspaceId:"W-1", branchId:"B-1", scopeKind:"BRANCH", scopeId:"B-1", draft:{ kind:"SYMBOL", canonicalName:"x", displayText:"secret-token", normalizedValue:"x", origin:"MODEL", status:"ACTIVE" } })).toThrow("MODEL_CONTEXT_MUST_BE_PROPOSED")
    const proposal = contexts.proposeItem({ workspaceId:"W-1", branchId:"B-1", scopeKind:"BRANCH", scopeId:"B-1", draft:{ kind:"SYMBOL", canonicalName:"x", displayText:"secret-token", normalizedValue:"x", origin:"MODEL" } })
    expect(proposal.status).toBe("PROPOSED")
    contexts.applyProposal(proposal.id, 1)
    expect(() => contexts.applyProposal(proposal.id, 1)).toThrow("REVISION_CONFLICT")
  })

  test("reports incompatible collisions and emits redacted structural events", () => {
    const { service: contexts, events } = service()
    contexts.proposeItem({ workspaceId:"W-1", branchId:"B-1", scopeKind:"WORKSPACE", scopeId:"W-1", draft:{ kind:"SYMBOL", canonicalName:"x", displayText:"Bearer raw-secret", normalizedValue:"x", origin:"USER" } })
    contexts.proposeItem({ workspaceId:"W-1", branchId:"B-1", scopeKind:"BRANCH", scopeId:"B-1", draft:{ kind:"NOTATION", canonicalName:"x", displayText:"x", normalizedValue:"x", origin:"USER" } })
    expect(contexts.detectConflicts({ workspaceId:"W-1", branchId:"B-1" })).toHaveLength(1)
    expect(JSON.stringify(events)).not.toContain("raw-secret")
    expect(events[0]?.type).toBe("context.item.proposed")
  })
})

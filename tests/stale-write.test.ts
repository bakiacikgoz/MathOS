import { expect, test } from "bun:test"
import { DatabaseClient, AgendaItemRepository } from "@mathos/storage"
import { join } from "node:path"
import { tmpdir } from "node:os"

test("repository stale writes fail with structured revision conflict", () => {
  const client = new DatabaseClient(join(tmpdir(), `mathos-stale-${crypto.randomUUID()}.sqlite`)); client.migrate(); const repo = new AgendaItemRepository(client.db)
  repo.insert({ id: "A-1", workspaceId: "W", branchId: "B", kind: "TASK", title: "T", description: "", status: "OPEN", priority: 1, expectedInformationGain: "HIGH", estimatedCost: "LOW", claimId: null, runId: null, dependencyIds: [], ownerType: null, ownerId: null, dueAt: null, revision: 1, createdAt: "now", updatedAt: "now", completedAt: null })
  repo.updateExpectedRevision("A-1", 1, { title: "new" }); expect(() => repo.updateExpectedRevision("A-1", 1, { title: "stale" })).toThrow("REVISION_CONFLICT"); client.close()
})

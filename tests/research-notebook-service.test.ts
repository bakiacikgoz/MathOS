import { afterEach, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { DatabaseClient, ResearchBlockRepository, ResearchDocumentRepository } from "@mathos/storage"
import { ResearchNotebookService } from "@mathos/core"

const clients: DatabaseClient[] = []
function setup(writeFile?: (path:string, content:string) => void) {
  const root = mkdtempSync(join(tmpdir(), "mathos-notebook-")); const client = new DatabaseClient(join(root,"db.sqlite")); client.migrate(); clients.push(client)
  const documents = new ResearchDocumentRepository(client.db), blocks = new ResearchBlockRepository(client.db)
  const service = new ResearchNotebookService({ root, documents, blocks, unitOfWork:(work) => client.unitOfWork(work), entityExists:(type,id) => type === "claim" && id === "C-001", clock:{ now:()=>"2030-01-01T00:00:00.000Z" }, writeFile })
  return { root, documents, blocks, service }
}
afterEach(() => { while (clients.length) clients.pop()!.close() })
const source = '# Notes\n\n:::claim-ref id="C-001"\nClaim.\n:::\n'

describe("research notebook service", () => {
  test("creates, updates with stable block IDs, and archives", () => {
    const { root, service, blocks } = setup()
    const created = service.create({ id:"D-1", workspaceId:"W-1", branchId:"B-1", title:"Notes", slug:"notes", sourcePath:"notes/main.mathos.md", content:source })
    expect(created.projectionStatus).toBe("HEALTHY")
    expect(readFileSync(join(root,"notes/main.mathos.md"),"utf8")).toBe(source)
    const ids = blocks.list("D-1").map((block) => block.id)
    const updated = service.update("D-1", 1, `${source}\nMore narrative.\n`)
    expect(blocks.list("D-1").slice(0, ids.length).map((block) => block.id)).toEqual(ids)
    expect(updated.document.revision).toBe(2)
    expect(service.archive("D-1", 2).status).toBe("ARCHIVED")
  })

  test("rejects broken references, duplicate slugs, stale revisions and external paths", () => {
    const { service } = setup()
    expect(() => service.create({ id:"D-X", workspaceId:"W-1", branchId:"B-1", title:"Bad", slug:"bad", sourcePath:"bad.md", content:':::claim-ref id="C-999"\nx\n:::\n' })).toThrow("BROKEN_NOTEBOOK_REFERENCE")
    service.create({ id:"D-1", workspaceId:"W-1", branchId:"B-1", title:"Notes", slug:"notes", sourcePath:"notes.md", content:source })
    expect(() => service.create({ id:"D-2", workspaceId:"W-1", branchId:"B-1", title:"Dup", slug:"notes", sourcePath:"dup.md", content:source })).toThrow()
    expect(() => service.update("D-1", 0, source)).toThrow("REVISION_CONFLICT")
    expect(() => service.create({ id:"D-3", workspaceId:"W-1", branchId:"B-1", title:"Outside", slug:"outside", sourcePath:"../outside.md", content:source })).toThrow("NOTEBOOK_PATH_OUTSIDE_WORKSPACE")
  })

  test("keeps canonical rows and reports degraded projection after file failure", () => {
    const { documents, blocks, service } = setup(() => { throw new Error("disk full") })
    const result = service.create({ id:"D-1", workspaceId:"W-1", branchId:"B-1", title:"Notes", slug:"notes", sourcePath:"notes.md", content:source })
    expect(result.projectionStatus).toBe("DEGRADED")
    expect(documents.get("D-1")).not.toBeNull()
    expect(blocks.list("D-1").length).toBeGreaterThan(0)
  })
})

import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { NotebookSyncEngine, parseMathosMarkdown, referencedEntities, type NotebookBlock, type NotebookSyncInput, type NotebookSyncPlan } from "@mathos/notebook"
import type { ResearchBlock, ResearchBlockKind, ResearchDocument } from "@mathos/domain"
import type { ResearchBlockRepository, ResearchDocumentRepository } from "@mathos/storage"
import type { ClockPort } from "../ports/clock-port.ts"

export interface ResearchNotebookDependencies {
  root: string; documents: ResearchDocumentRepository; blocks: ResearchBlockRepository; clock: ClockPort
  unitOfWork<T>(work: () => T): T
  entityExists(type: string, id: string): boolean
  writeFile?: (path: string, content: string) => void
}
export interface CreateNotebookInput { id:string; workspaceId:string; branchId:string; title:string; slug:string; sourcePath:string; content:string }
export interface NotebookMutationResult { document: ResearchDocument; projectionStatus:"HEALTHY"|"DEGRADED"; projectionError?:string }
const hash = (value:string) => createHash("sha256").update(value).digest("hex")
const kind = (block: NotebookBlock): ResearchBlockKind => ({ "claim-ref":"CLAIM_REF", "proof-sketch":"PROOF_SKETCH", "context-ref":"CONTEXT_REF", "experiment-ref":"EXPERIMENT_REF", "source-excerpt-ref":"SOURCE_EXCERPT_REF", decision:"DECISION" }[block.directive ?? ""] as ResearchBlockKind | undefined) ?? "NARRATIVE"

export class ResearchNotebookService {
  private readonly sync = new NotebookSyncEngine()
  constructor(private readonly d: ResearchNotebookDependencies) {}

  create(input: CreateNotebookInput): NotebookMutationResult {
    const target = this.safePath(input.sourcePath); const parsed = this.validate(input.content); const now = this.d.clock.now()
    const document: ResearchDocument = { id:input.id, workspaceId:input.workspaceId, branchId:input.branchId, title:input.title, slug:input.slug, format:"MATHOS_MARKDOWN", status:"ACTIVE", sourcePath:input.sourcePath.replace(/\\/g,"/"), revision:1, contentHash:hash(input.content), createdAt:now, updatedAt:now }
    this.d.unitOfWork(() => { this.d.documents.insert(document); this.storeBlocks(document.id, parsed.blocks, now) })
    return this.project(document, target, input.content)
  }

  update(id: string, expectedRevision: number, content: string): NotebookMutationResult {
    const existing = this.d.documents.get(id)
    if (!existing) throw new Error(`NOTEBOOK_NOT_FOUND: ${id}`)
    const parsed = this.validate(content), now = this.d.clock.now()
    const document = this.d.unitOfWork(() => {
      const updated = this.d.documents.updateExpectedRevision(id, expectedRevision, { contentHash:hash(content), updatedAt:now })
      this.d.blocks.deleteForDocument(id); this.storeBlocks(id, parsed.blocks, now); return updated
    })
    return this.project(document, this.safePath(document.sourcePath), content)
  }

  archive(id: string, expectedRevision: number): ResearchDocument { return this.d.documents.updateExpectedRevision(id, expectedRevision, { status:"ARCHIVED", updatedAt:this.d.clock.now() }) }
  planSync(input:NotebookSyncInput):NotebookSyncPlan { return this.sync.plan(input) }
  applySync(plan:NotebookSyncPlan):NotebookSyncPlan { return this.sync.apply(plan) }

  rebuild(id: string): NotebookMutationResult {
    const document = this.d.documents.get(id)
    if (!document) throw new Error(`NOTEBOOK_NOT_FOUND: ${id}`)
    const content = this.d.blocks.list(id, { limit:10_000 }).map((block) => String(block.markdown)).join("")
    return this.project(document, this.safePath(document.sourcePath), content)
  }

  private validate(content: string) {
    const parsed = parseMathosMarkdown(content)
    for (const reference of referencedEntities(parsed)) if (!this.d.entityExists(reference.type, reference.id)) throw new Error(`BROKEN_NOTEBOOK_REFERENCE: ${reference.type}:${reference.id}`)
    return parsed
  }
  private storeBlocks(documentId:string, blocks:NotebookBlock[], now:string): void {
    blocks.forEach((block, sequence) => {
      const entityId = block.directive === "proof-sketch" ? block.attributes.claim ?? null : block.attributes.id ?? null
      const row: ResearchBlock = { id:`NB-${hash(`${documentId}:${block.directive ?? "narrative"}:${entityId ?? block.raw}`).slice(0,16)}`, documentId, parentBlockId:null, sequence, kind:kind(block), markdown:block.raw, entityType:block.directive, entityId, attributes:block.attributes, revision:1, contentHash:hash(block.raw), createdAt:now, updatedAt:now }
      this.d.blocks.insert(row)
    })
  }
  private safePath(path:string): string {
    const target = resolve(this.d.root, path); const rel = relative(resolve(this.d.root), target)
    if (!path || rel.startsWith("..") || rel.includes(":")) throw new Error("NOTEBOOK_PATH_OUTSIDE_WORKSPACE")
    return target
  }
  private project(document:ResearchDocument, path:string, content:string): NotebookMutationResult {
    try { if (this.d.writeFile) this.d.writeFile(path, content); else { mkdirSync(dirname(path), { recursive:true }); writeFileSync(path, content, "utf8") }; return { document, projectionStatus:"HEALTHY" } }
    catch (error) { return { document, projectionStatus:"DEGRADED", projectionError:error instanceof Error ? error.message : String(error) } }
  }
}

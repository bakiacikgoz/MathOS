import type { Database } from "bun:sqlite"
import { V1Repository } from "./v1-repository-utils.ts"
type Row = { id: string; revision?: number; [key: string]: unknown }
export class ResearchDocumentRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"research_documents",["id","workspaceId","branchId","title","slug","format","status","sourcePath","revision","contentHash","createdAt","updatedAt"],[],"slug") } }
export class ResearchBlockRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"research_blocks",["id","documentId","parentBlockId","sequence","kind","markdown","entityType","entityId","attributes","revision","contentHash","createdAt","updatedAt"],["attributes"],"sequence") } }
export class NotebookSyncRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"notebook_sync_records",["id","sourceKind","sourceId","targetKind","targetId","sourceRevision","targetRevision","sourceHash","targetHash","direction","status","diffSummary","createdAt","appliedAt"],[],"created_at") } }

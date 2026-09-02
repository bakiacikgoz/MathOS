import type { Database } from "bun:sqlite"
import { V1Repository } from "./v1-repository-utils.ts"
type Row = { id: string; revision?: number; [key: string]: unknown }
export class ProjectionRecordRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"projection_records",["id","kind","workspaceId","branchId","schemaVersion","sourceEventSequence","content","contentHash","generatedAt"],["content"],"source_event_sequence") } }

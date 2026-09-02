import type { Database } from "bun:sqlite"
import { V1Repository } from "./v1-repository-utils.ts"
type Row = { id: string; revision?: number; [key: string]: unknown }
export class ProjectionRecordRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"projection_records",["id","kind","workspaceId","branchId","schemaVersion","sourceEventSequence","content","contentHash","generatedAt"],["content"],"source_event_sequence") } }
export class AtlasProjectionRepository extends ProjectionRecordRepository { latest(workspaceId:string):Row|null{const row=this.db.query<Record<string,unknown>,[string]>("SELECT * FROM projection_records WHERE workspace_id=? AND kind='ATLAS' ORDER BY source_event_sequence DESC LIMIT 1").get(workspaceId);return row?this.decode(row):null} }

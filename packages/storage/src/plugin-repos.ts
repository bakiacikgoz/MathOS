import type { Database } from "bun:sqlite"
import { V1Repository } from "./v1-repository-utils.ts"
type Row = { id: string; revision?: number; [key: string]: unknown }
export class PluginRecordRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"plugin_records",["id","name","version","protocol","kind","manifest","manifestHash","status","violationCount","revision","createdAt","updatedAt"],["manifest"],"name") } }
export function pluginNeedsApproval(row:Row,currentHash:string){return row.status==="ENABLED"&&row.manifestHash!==currentHash}

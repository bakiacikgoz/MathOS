import type { Database } from "bun:sqlite"
import { V1Repository } from "./v1-repository-utils.ts"
type Row = { id: string; revision?: number; [key: string]: unknown }
export class CapsuleRecordRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"capsule_records",["id","workspaceId","manifest","manifestHash","artifactPath","status","revision","createdAt","verifiedAt"],["manifest"],"created_at") } latest(workspaceId:string){return this.list(workspaceId,{limit:100}).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]??null} }
export class PublicationRecordRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"publication_records",["id","documentId","formats","artifactPaths","warnings","status","revision","createdAt"],["formats","artifactPaths","warnings"],"created_at") } }

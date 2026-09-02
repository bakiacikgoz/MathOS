import type { Database } from "bun:sqlite"
import { V1Repository } from "./v1-repository-utils.ts"
type Row = { id: string; revision?: number; [key: string]: unknown }
export class ReviewPacketRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"review_packets",["id","sourceBranchId","targetBranchId","sourceRevision","targetRevision","semanticDiffHash","includedEntities","status","generatedBy","revision","createdAt"],["includedEntities"],"created_at") } }
export class ReviewFindingRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"review_findings",["id","packetId","entityType","entityId","entityRevision","category","severity","message","status","reviewerIdentity","createdAt","updatedAt"],[],"severity") } }
export class ReviewAttestationRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"review_attestations",["id","packetId","packetHash","reviewerIdentityId","decision","signatureMode","note","createdAt"],[],"created_at") } }
export function hasBlockingFindings(rows:Row[]){return rows.some(row=>row.severity==="HIGH"&&row.status!=="RESOLVED")}

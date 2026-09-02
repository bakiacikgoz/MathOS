import type { Database } from "bun:sqlite"
import type { AlignmentFinding, FormalAlignment, StatementRevision } from "@mathos/domain"
import { V1Repository } from "./v1-repository-utils.ts"
type Row = { id: string; revision?: number; [key: string]: unknown }
export class StatementRevisionRepository extends V1Repository<StatementRevision> {
  constructor(db: Database) { super(db,"statement_revisions",["id","claimId","kind","sourceEntityId","text","contextRevisionId","revision","contentHash","createdBy","createdAt"],[],"revision") }
  latest(claimId:string,kind:StatementRevision["kind"]):StatementRevision|null{const rows=this.db.query<Record<string,unknown>,[string,string]>("SELECT * FROM statement_revisions WHERE claim_id=? AND kind=? ORDER BY revision DESC LIMIT 1").all(claimId,kind);return rows[0]?this.decode(rows[0]):null}
}
export class FormalAlignmentRepository extends V1Repository<FormalAlignment> { constructor(db: Database) { super(db,"formal_alignments",["id","claimId","naturalRevisionId","formalRevisionId","contextRevisionId","status","verdict","backTranslation","symbolMapping","auditorProvider","auditorModel","promptHash","createdAt","decidedAt"],["symbolMapping"],"created_at") } }
export class AlignmentFindingRepository extends V1Repository<AlignmentFinding> {
  constructor(db: Database) { super(db,"alignment_findings",["id","alignmentId","dimension","severity","naturalFragment","formalFragment","message","resolutionStatus","reviewerNote"],[],"id") }
  listByAlignment(alignmentId:string):AlignmentFinding[]{return this.db.query<Record<string,unknown>,[string]>("SELECT * FROM alignment_findings WHERE alignment_id=? ORDER BY id").all(alignmentId).map((row)=>this.decode(row))}
}
export class StaleMarkerRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"stale_markers",["id","targetType","targetId","sourceType","sourceId","reasonCode","detectedAt","resolvedAt","requiredAction","previousStatus","projectionStatus"],[],"detected_at") } }

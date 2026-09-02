import type { Database } from "bun:sqlite"
import { V1Repository } from "./v1-repository-utils.ts"
type Row = { id: string; revision?: number; [key: string]: unknown }
export class StatementRevisionRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"statement_revisions",["id","claimId","kind","sourceEntityId","text","contextRevisionId","revision","contentHash","createdBy","createdAt"],[],"revision") } }
export class FormalAlignmentRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"formal_alignments",["id","claimId","naturalRevisionId","formalRevisionId","contextRevisionId","status","verdict","backTranslation","symbolMapping","auditorProvider","auditorModel","promptHash","createdAt","decidedAt"],["symbolMapping"],"created_at") } }
export class AlignmentFindingRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"alignment_findings",["id","alignmentId","dimension","severity","naturalFragment","formalFragment","message","resolutionStatus","reviewerNote"],[],"id") } }
export class StaleMarkerRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"stale_markers",["id","targetType","targetId","sourceType","sourceId","reasonCode","detectedAt","resolvedAt","requiredAction","previousStatus","projectionStatus"],[],"detected_at") } }

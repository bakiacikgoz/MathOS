import type { Database } from "bun:sqlite"
import { V1Repository } from "./v1-repository-utils.ts"
type Row = { id: string; revision?: number; [key: string]: unknown }
export class FailureFingerprintRepository extends V1Repository<Row> {
  constructor(db: Database) { super(db,"failure_fingerprints",["id","domain","goalHash","contextHash","failureClass","normalizedDiagnostic","attemptedApproach","premiseSetHash","fingerprint","occurrenceCount","firstSeenAt","lastSeenAt"],[],"last_seen_at DESC") }
  findByFingerprint(fingerprint:string):Row|null { const row=this.db.query<Record<string,unknown>,[string]>("SELECT * FROM failure_fingerprints WHERE fingerprint=?").get(fingerprint);return row?this.decode(row):null }
  increment(id:string,lastSeenAt:string):Row { this.db.query("UPDATE failure_fingerprints SET occurrence_count=occurrence_count+1,last_seen_at=? WHERE id=?").run(lastSeenAt,id);return this.get(id)! }
}
export class FailureOccurrenceRepository extends V1Repository<Row> {
  constructor(db: Database) { super(db,"failure_occurrences",["id","failureId","runId","jobId","stepId","candidateId","artifactRefs","environmentFingerprint","createdAt"],["artifactRefs"],"created_at") }
  listForFailure(failureId:string):Row[]{return this.db.query<Record<string,unknown>,[string]>("SELECT * FROM failure_occurrences WHERE failure_id=? ORDER BY created_at,id").all(failureId).map(row=>this.decode(row))}
}

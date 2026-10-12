import type { Database } from "bun:sqlite"
import type { MemoryNote } from "@mathos/domain"
import { V1Repository } from "./v1-repository-utils.ts"
type Row = { id: string; revision?: number; [key: string]: unknown }
export class FailureFingerprintRepository extends V1Repository<Row> {
  constructor(db: Database) { super(db,"failure_fingerprints",["id","domain","goalHash","contextHash","failureClass","normalizedDiagnostic","attemptedApproach","premiseSetHash","fingerprint","occurrenceCount","firstSeenAt","lastSeenAt"],[],"last_seen_at DESC") }
  findByFingerprint(fingerprint:string):Row|null { const row=this.db.query<Record<string,unknown>,[string]>("SELECT * FROM failure_fingerprints WHERE fingerprint=?").get(fingerprint);return row?this.decode(row):null }
  increment(id:string,lastSeenAt:string):Row { this.db.query("UPDATE failure_fingerprints SET occurrence_count=occurrence_count+1,last_seen_at=? WHERE id=?").run(lastSeenAt,id);return this.get(id)! }
  /** The failures recorded for one goal (a Lean statement's hash), most recent first. */
  listForGoal(domain:string,goalHash:string,limit=20):Row[]{return this.db.query<Record<string,unknown>,[string,string,number]>("SELECT * FROM failure_fingerprints WHERE domain=? AND goal_hash=? ORDER BY last_seen_at DESC,id DESC LIMIT ?").all(domain,goalHash,limit).map(row=>this.decode(row))}
}
export class MemoryNoteRepository extends V1Repository<MemoryNote> {
  constructor(db: Database) { super(db,"memory_notes",["id","workspaceId","branchId","scopeKind","kind","text","basis","status","origin","claimId","sourceRef","reason","revision","createdAt","updatedAt"],[],"updated_at DESC") }
  listForWorkspace(workspaceId:string):MemoryNote[]{return this.db.query<Record<string,unknown>,[string]>("SELECT * FROM memory_notes WHERE workspace_id=? ORDER BY updated_at DESC,id DESC").all(workspaceId).map(row=>this.decode(row))}
}
export class FailureOccurrenceRepository extends V1Repository<Row> {
  constructor(db: Database) { super(db,"failure_occurrences",["id","failureId","runId","jobId","stepId","candidateId","artifactRefs","environmentFingerprint","createdAt"],["artifactRefs"],"created_at") }
  listForFailure(failureId:string):Row[]{return this.db.query<Record<string,unknown>,[string]>("SELECT * FROM failure_occurrences WHERE failure_id=? ORDER BY created_at,id").all(failureId).map(row=>this.decode(row))}
}

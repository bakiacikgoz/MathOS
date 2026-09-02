import type { Database } from "bun:sqlite"
import { V1Repository } from "./v1-repository-utils.ts"
type Row = { id: string; revision?: number; [key: string]: unknown }
export class FailureFingerprintRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"failure_fingerprints",["id","domain","goalHash","contextHash","failureClass","normalizedDiagnostic","attemptedApproach","premiseSetHash","fingerprint","occurrenceCount","firstSeenAt","lastSeenAt"],[],"last_seen_at DESC") } }
export class FailureOccurrenceRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"failure_occurrences",["id","failureId","runId","jobId","stepId","candidateId","artifactRefs","environmentFingerprint","createdAt"],["artifactRefs"],"created_at") } }

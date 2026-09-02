import type { Database } from "bun:sqlite"
import { V1Repository } from "./v1-repository-utils.ts"
type Row = { id: string; revision?: number; [key: string]: unknown }
export class SolverJobRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"solver_jobs",["id","workspaceId","branchId","claimId","solverId","solverVersion","problemKind","requestArtifactId","status","policySnapshot","revision","createdAt","startedAt","finishedAt"],["policySnapshot"],"created_at") } }
export class SolverResultRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"solver_results",["id","jobId","outcome","trustClass","structured","witnessArtifactId","certificateArtifactId","replayStatus","exact","deterministic","runtimeFingerprint","inputHash","outputHash","evidenceId","createdAt"],["structured"],"created_at") } }

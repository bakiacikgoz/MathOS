import type { Database } from "bun:sqlite"
import { V1Repository, V1RevisionConflictError } from "./v1-repository-utils.ts"
type Row = { id: string; revision?: number; [key: string]: unknown }
export class ProofPortfolioRepository extends V1Repository<Row> {
  constructor(db: Database) { super(db,"proof_portfolios",["id","claimId","formalStatementId","formalRevisionHash","branchId","status","selectionPolicy","limits","usage","retrievalIndexRevision","contextRevisionId","winnerCandidateId","revision","createdAt","startedAt","stoppedAt","stopReason"],["selectionPolicy","limits","usage"],"created_at") }
  selectWinner(portfolioId: string, candidateId: string, expectedRevision: number): Row {
    return this.db.transaction(() => {
      const candidate = this.db.query<{ portfolio_id: string; status: string }, [string]>("SELECT j.portfolio_id, c.status FROM proof_candidates c JOIN proof_jobs j ON j.id=c.proof_job_id WHERE c.id=?").get(candidateId)
      if (!candidate || candidate.portfolio_id !== portfolioId || candidate.status !== "VERIFIED") throw new Error("INVALID_PORTFOLIO_WINNER")
      const result = this.db.query("UPDATE proof_portfolios SET winner_candidate_id=?, status='SUCCEEDED', revision=revision+1 WHERE id=? AND revision=?").run(candidateId, portfolioId, expectedRevision)
      if (result.changes !== 1) throw new V1RevisionConflictError(portfolioId)
      return this.get(portfolioId)!
    })()
  }
}
export class ProofJobRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"proof_jobs",["id","portfolioId","adapterId","adapterVersion","strategy","workerBranchId","worktreePath","status","idempotencyKey","budget","provider","model","promptHash","createdAt","startedAt","finishedAt","errorCode"],["budget"],"created_at") } }
export class ProofCandidateRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"proof_candidates",["id","proofJobId","sourceArtifactId","normalizedProofHash","declarationHash","compileResult","diagnostics","axioms","forbidden","verificationReportId","status","score","createdAt"],["diagnostics","axioms","forbidden"],"score DESC") } }
export class ProofRepairAttemptRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"proof_repair_attempts",["id","candidateId","failureFingerprintId","attemptNumber","inputArtifactHash","outputArtifactHash","status","promptHash","diagnosticsDelta","createdAt"],["diagnosticsDelta"],"attempt_number") } }

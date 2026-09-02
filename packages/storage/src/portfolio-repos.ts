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
  findActive(claimId: string, formalRevisionHash: string): Row | null {
    const row = this.db.query<Record<string, unknown>, [string,string]>("SELECT * FROM proof_portfolios WHERE claim_id=? AND formal_revision_hash=? AND status IN ('PENDING','RUNNING') ORDER BY created_at,id LIMIT 1").get(claimId,formalRevisionHash)
    return row ? this.decode(row) : null
  }
}
export class ProofJobRepository extends V1Repository<Row> {
  constructor(db: Database) { super(db,"proof_jobs",["id","portfolioId","adapterId","adapterVersion","strategy","workerBranchId","worktreePath","status","idempotencyKey","budget","provider","model","promptHash","createdAt","startedAt","finishedAt","errorCode"],["budget"],"created_at") }
  getByIdempotencyKey(key:string):Row|null { const row=this.db.query<Record<string,unknown>,[string]>("SELECT * FROM proof_jobs WHERE idempotency_key=?").get(key); return row ? this.decode(row) : null }
  updateRuntime(id:string, patch:{status?:string;workerBranchId?:string|null;worktreePath?:string|null;startedAt?:string|null;finishedAt?:string|null;errorCode?:string|null}):Row {
    const entries=Object.entries(patch); if(!entries.length)return this.get(id)!
    const snake=(key:string)=>key.replace(/[A-Z]/g,(letter)=>`_${letter.toLowerCase()}`)
    this.db.query(`UPDATE proof_jobs SET ${entries.map(([key])=>`${snake(key)}=?`).join(",")} WHERE id=?`).run(...entries.map(([,value])=>value) as never[],id)
    return this.get(id)!
  }
  updateBudget(id:string,budget:Record<string,unknown>):Row { this.db.query("UPDATE proof_jobs SET budget_json=? WHERE id=?").run(JSON.stringify(budget),id);return this.get(id)! }
}
export class ProofCandidateRepository extends V1Repository<Row> {
  constructor(db: Database) { super(db,"proof_candidates",["id","proofJobId","sourceArtifactId","normalizedProofHash","declarationHash","compileResult","diagnostics","axioms","forbidden","verificationReportId","status","score","createdAt"],["diagnostics","axioms","forbidden"],"score DESC") }
  firstForJob(jobId:string):Row|null { return this.list(jobId,{limit:1})[0] ?? null }
  findByNormalizedHash(portfolioId:string,normalizedProofHash:string):Row|null { const row=this.db.query<Record<string,unknown>,[string,string]>("SELECT c.* FROM proof_candidates c JOIN proof_jobs j ON j.id=c.proof_job_id WHERE j.portfolio_id=? AND c.normalized_proof_hash=? ORDER BY c.id LIMIT 1").get(portfolioId,normalizedProofHash);return row?this.decode(row):null }
}
export class ProofRepairAttemptRepository extends V1Repository<Row> { constructor(db: Database) { super(db,"proof_repair_attempts",["id","candidateId","failureFingerprintId","attemptNumber","inputArtifactHash","outputArtifactHash","status","promptHash","diagnosticsDelta","createdAt"],["diagnosticsDelta"],"attempt_number") } }

export class PortfolioBudgetRepository {
  constructor(private readonly db:Database){}
  reserve(input:{id:string;portfolioId:string;jobId:string;amount:number;createdAt:string}):void {
    this.db.query("INSERT OR IGNORE INTO budget_reservations (id,session_id,agent_id,resource,amount,round_sequence,status,created_at) VALUES (?,?,?,'PROOF_ATTEMPT',?,0,'RESERVED',?)").run(input.id,input.portfolioId,input.jobId,input.amount,input.createdAt)
  }
  has(portfolioId:string,jobId:string):boolean { return Boolean(this.db.query("SELECT 1 FROM budget_reservations WHERE session_id=? AND agent_id=? AND resource='PROOF_ATTEMPT'").get(portfolioId,jobId)) }
  count(portfolioId:string):number { return this.db.query<{n:number},[string]>("SELECT COUNT(*) n FROM budget_reservations WHERE session_id=? AND resource='PROOF_ATTEMPT'").get(portfolioId)?.n ?? 0 }
}

export class PortfolioLeaseRepository {
  constructor(private readonly db:Database){}
  reserve(input:{id:string;portfolioId:string;jobId:string;branchId:string;createdAt:string}):void {
    this.db.query("INSERT OR IGNORE INTO execution_leases (lease_id,session_id,agent_id,run_id,branch_id,round_sequence,status,created_at) VALUES (?,?,?,?,?,0,'RESERVED',?)").run(input.id,input.portfolioId,input.jobId,input.jobId,input.branchId,input.createdAt)
  }
  markRunning(jobId:string):void { this.db.query("UPDATE execution_leases SET status='RUNNING' WHERE run_id=? AND status='RESERVED'").run(jobId) }
  release(jobId:string):void { this.db.query("UPDATE execution_leases SET status='RELEASED' WHERE run_id=? AND status IN ('RESERVED','RUNNING')").run(jobId) }
  hasActive(jobId:string):boolean { return Boolean(this.db.query("SELECT 1 FROM execution_leases WHERE run_id=? AND status IN ('RESERVED','RUNNING')").get(jobId)) }
  activeCount(portfolioId:string):number { return this.db.query<{n:number},[string]>("SELECT COUNT(*) n FROM execution_leases WHERE session_id=? AND status IN ('RESERVED','RUNNING')").get(portfolioId)?.n ?? 0 }
}

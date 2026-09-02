import { createHash } from "node:crypto"
import { join } from "node:path"
import type { PortfolioBudgetRepository, PortfolioLeaseRepository, ProofCandidateRepository, ProofJobRepository, ProofPortfolioRepository } from "@mathos/storage"
import { declarationsMatch, scanForbidden, type ProofCandidateEvaluation, type ProofCandidateRecord } from "@mathos/domain"
import type { ProofRepairInput,ProofRepairResult,ProofRepairService } from "./proof-repair-service.ts"

type StoredRow={id:string;[key:string]:unknown}
export type ProofPortfolioCrashPoint="after_reservation"|"after_process_start"|"after_candidate_write"
export interface ProofRecipe { adapterId:string;adapterVersion:string;strategy:string;budget:number;provider?:string|null;model?:string|null;promptHash?:string|null }
export interface GlobalPremiseSetBinding { id:string;hash:string;revision:string }
export interface ProofPortfolioStartInput {
  id:string;claimId:string;formalStatementId:string;formalRevisionHash:string;contextRevisionId:string;retrievalIndexRevision:string;branchId:string;maxWorkers:number
  recipes:readonly ProofRecipe[];premiseMode:"RANKED"|"GLOBAL_SET";globalPremisePlanner?:()=>GlobalPremiseSetBinding
  candidateFactory?:(input:{jobId:string;recipe:ProofRecipe})=>{id:string;sourceArtifactId:string;normalizedProofHash:string;declarationHash:string}
}
export interface ProofPortfolioDependencies {
  root:string;portfolios:ProofPortfolioRepository;jobs:ProofJobRepository;candidates:ProofCandidateRepository;budgets:PortfolioBudgetRepository;leases:PortfolioLeaseRepository
  unitOfWork<T>(work:()=>T):T;now():string;nextId(prefix:string):string
  createWorker(input:{jobId:string;gitRef:string;worktreePath:string}):Promise<{branchId:string;worktreePath:string}>
  startProcess(input:{jobId:string;recipe:ProofRecipe;worktreePath:string}):Promise<{processId:string}>
  crashHook?:(point:ProofPortfolioCrashPoint)=>void
  storeProofArtifact?:(candidateId:string,source:string)=>string
  abortJob?:(jobId:string)=>Promise<void>
}
export const MAX_PROOF_PORTFOLIO_WORKERS=8
const hash=(value:string)=>createHash("sha256").update(value).digest("hex")

export class ProofPortfolioService {
  constructor(private readonly d:ProofPortfolioDependencies){}
  async start(input:ProofPortfolioStartInput):Promise<{portfolio:StoredRow;jobs:StoredRow[];runningJobs:number}> {
    if(!input.formalRevisionHash||!input.contextRevisionId||!input.retrievalIndexRevision)throw new Error("EXACT_PORTFOLIO_REVISIONS_REQUIRED")
    if(!Number.isInteger(input.maxWorkers)||input.maxWorkers<1||input.maxWorkers>MAX_PROOF_PORTFOLIO_WORKERS)throw new Error("PROOF_PORTFOLIO_WORKER_LIMIT_INVALID")
    if(this.d.portfolios.findActive(input.claimId,input.formalRevisionHash))throw new Error("ACTIVE_PROOF_PORTFOLIO_EXISTS")
    const recipes=[...input.recipes].sort((a,b)=>`${a.adapterId}:${a.strategy}`.localeCompare(`${b.adapterId}:${b.strategy}`))
    const selectionPolicy:Record<string,unknown>={premiseMode:input.premiseMode}
    if(input.premiseMode==="GLOBAL_SET") {
      if(input.globalPremisePlanner){const set=input.globalPremisePlanner();Object.assign(selectionPolicy,{globalPremiseSetId:set.id,globalPremiseSetHash:set.hash,globalPremiseSetRevision:set.revision})}
      else Object.assign(selectionPolicy,{premiseMode:"RANKED",fallbackReason:"GLOBAL_PREMISE_PLANNER_UNAVAILABLE"})
    }
    const now=this.d.now()
    this.d.unitOfWork(()=>{
      this.d.portfolios.insert({id:input.id,claimId:input.claimId,formalStatementId:input.formalStatementId,formalRevisionHash:input.formalRevisionHash,branchId:input.branchId,status:"RUNNING",selectionPolicy,limits:{maxWorkers:input.maxWorkers},usage:{reservedBudget:0},retrievalIndexRevision:input.retrievalIndexRevision,contextRevisionId:input.contextRevisionId,winnerCandidateId:null,revision:1,createdAt:now,startedAt:now,stoppedAt:null,stopReason:null})
      recipes.forEach((recipe,index)=>{const id=`${input.id}-J${String(index+1).padStart(3,"0")}`;this.d.jobs.insert({id,portfolioId:input.id,adapterId:recipe.adapterId,adapterVersion:recipe.adapterVersion,strategy:recipe.strategy,workerBranchId:null,worktreePath:null,status:"PENDING",idempotencyKey:hash(`${input.id}:${input.formalRevisionHash}:${input.contextRevisionId}:${input.retrievalIndexRevision}:${recipe.adapterId}:${recipe.strategy}`),budget:{attempts:recipe.budget},provider:recipe.provider??null,model:recipe.model??null,promptHash:recipe.promptHash??null,createdAt:now,startedAt:null,finishedAt:null,errorCode:null})})
    })
    for(let index=0;index<Math.min(input.maxWorkers,recipes.length);index++)await this.dispatch(input,recipes[index]!,index)
    return {portfolio:this.d.portfolios.get(input.id)!,jobs:this.d.jobs.list(input.id),runningJobs:this.d.leases.activeCount(input.id)}
  }
  async reconcile(portfolioId:string):Promise<{portfolio:StoredRow;jobs:StoredRow[];runningJobs:number}> {
    const portfolio=this.d.portfolios.get(portfolioId);if(!portfolio)throw new Error(`PROOF_PORTFOLIO_NOT_FOUND:${portfolioId}`)
    for(const job of this.d.jobs.list(portfolioId))if(this.d.budgets.has(portfolioId,job.id)&&this.d.leases.hasActive(job.id)&&job.status==="PENDING")this.d.jobs.updateRuntime(job.id,{status:"RUNNING",startedAt:this.d.now()})
    return {portfolio:this.d.portfolios.get(portfolioId)!,jobs:this.d.jobs.list(portfolioId),runningJobs:this.d.leases.activeCount(portfolioId)}
  }
  status(portfolioId:string):{portfolio:StoredRow;jobs:StoredRow[];candidates:StoredRow[];runningJobs:number}{const portfolio=this.d.portfolios.get(portfolioId);if(!portfolio)throw new Error(`PROOF_PORTFOLIO_NOT_FOUND:${portfolioId}`);const jobs=this.d.jobs.list(portfolioId);return{portfolio,jobs,candidates:jobs.flatMap(job=>this.d.candidates.list(job.id,{limit:10_000})),runningJobs:this.d.leases.activeCount(portfolioId)}}
  async cancel(portfolioId:string):Promise<StoredRow>{const state=this.status(portfolioId);for(const job of state.jobs)if(job.status==="RUNNING"||job.status==="PENDING"){await this.d.abortJob?.(job.id);this.d.jobs.updateRuntime(job.id,{status:"CANCELLED",finishedAt:this.d.now(),errorCode:"USER_CANCELLED"});this.d.leases.release(job.id)}return this.d.portfolios.updateExpectedRevision(portfolioId,Number(state.portfolio.revision),{status:"CANCELLED",stoppedAt:this.d.now(),stopReason:"USER_CANCELLED"})}
  async evaluateCandidate(input:{id?:string;portfolioId:string;jobId:string;formalDeclaration:string;proofSource:string;modelCallCost:number;compile:ProofCandidateEvaluation;verificationGatePassed:boolean;verificationReportId?:string|null}):Promise<ProofCandidateRecord>{
    const portfolio=this.d.portfolios.get(input.portfolioId),job=this.d.jobs.get(input.jobId)
    if(!portfolio||!job||job.portfolioId!==input.portfolioId)throw new Error("PROOF_CANDIDATE_SCOPE_MISMATCH")
    const normalized=input.proofSource.normalize("NFC").trim().replace(/\s+/g," "),normalizedProofHash=hash(normalized)
    const existing=this.d.candidates.findByNormalizedHash(input.portfolioId,normalizedProofHash)
    if(existing)return existing as unknown as ProofCandidateRecord
    const id=input.id??this.d.nextId("PC"),forbidden=scanForbidden(input.proofSource),declarationMatches=declarationsMatch(input.formalDeclaration,input.proofSource)
    const axiomClean=input.compile.axioms.length===0,kernel=input.compile.result==="KERNEL_ACCEPTED"
    const valid=declarationMatches&&forbidden.length===0&&kernel&&axiomClean&&input.verificationGatePassed
    const compileResult=!declarationMatches?"STATEMENT_MUTATED":input.compile.result
    const sourceArtifactId=this.d.storeProofArtifact?.(id,input.proofSource)??`proof-candidate:${id}`
    const row:ProofCandidateRecord={id,proofJobId:input.jobId,sourceArtifactId,normalizedProofHash,declarationHash:String(portfolio.formalRevisionHash),compileResult,diagnostics:input.compile.diagnostics,axioms:input.compile.axioms,forbidden,verificationReportId:input.verificationReportId??null,status:valid?"VERIFIED":"REJECTED",score:normalized.length,createdAt:this.d.now()}
    this.d.unitOfWork(()=>{this.d.candidates.insert(row as unknown as StoredRow);this.d.jobs.updateBudget(input.jobId,{...(job.budget as Record<string,unknown>),modelCallCost:input.modelCallCost});this.d.jobs.updateRuntime(input.jobId,{status:valid?"DONE":"FAILED",finishedAt:this.d.now(),errorCode:valid?null:compileResult})})
    this.d.leases.release(input.jobId)
    return row
  }
  async finalizeWinner(portfolioId:string,userCandidateId?:string):Promise<ProofCandidateRecord>{
    const portfolio=this.d.portfolios.get(portfolioId);if(!portfolio)throw new Error(`PROOF_PORTFOLIO_NOT_FOUND:${portfolioId}`)
    const valid=this.d.jobs.list(portfolioId).flatMap(job=>this.d.candidates.list(job.id,{limit:10_000}).filter(candidate=>candidate.status==="VERIFIED").map(candidate=>({candidate,job})))
    if(userCandidateId&&!valid.some(({candidate})=>candidate.id===userCandidateId))throw new Error("INVALID_USER_SELECTED_CANDIDATE")
    valid.sort((a,b)=>Number(a.candidate.score)-Number(b.candidate.score)||Number((a.job.budget as Record<string,unknown>).modelCallCost??0)-Number((b.job.budget as Record<string,unknown>).modelCallCost??0)||a.candidate.id.localeCompare(b.candidate.id))
    const selected=userCandidateId?valid.find(({candidate})=>candidate.id===userCandidateId):valid[0]
    if(!selected)throw new Error("NO_VALID_PROOF_CANDIDATE")
    this.d.portfolios.selectWinner(portfolioId,selected.candidate.id,Number(portfolio.revision))
    for(const job of this.d.jobs.list(portfolioId))if(job.id!==selected.job.id&&(job.status==="RUNNING"||job.status==="PENDING")){await this.d.abortJob?.(job.id);this.d.jobs.updateRuntime(job.id,{status:"CANCELLED",finishedAt:this.d.now(),errorCode:"PORTFOLIO_WINNER_SELECTED"});this.d.leases.release(job.id)}
    return selected.candidate as unknown as ProofCandidateRecord
  }
  repairCandidate(input:ProofRepairInput,service:ProofRepairService):Promise<ProofRepairResult>{return service.repair(input)}
  private async dispatch(input:ProofPortfolioStartInput,recipe:ProofRecipe,index:number):Promise<void>{
    const jobId=`${input.id}-J${String(index+1).padStart(3,"0")}`,job=this.d.jobs.get(jobId)!;const now=this.d.now()
    if(!this.d.budgets.has(input.id,jobId))this.d.budgets.reserve({id:`BUDGET-${jobId}`,portfolioId:input.id,jobId,amount:recipe.budget,createdAt:now})
    const gitRef=`mathos/portfolio-${input.id.toLowerCase()}-${index+1}`,worktreePath=join(this.d.root,".mathos","worktrees",jobId)
    if(!this.d.leases.hasActive(jobId))this.d.leases.reserve({id:`LEASE-${jobId}`,portfolioId:input.id,jobId,branchId:gitRef,createdAt:now})
    this.d.crashHook?.("after_reservation")
    const worker=await this.d.createWorker({jobId,gitRef,worktreePath})
    this.d.jobs.updateRuntime(jobId,{status:"RUNNING",workerBranchId:worker.branchId,worktreePath:worker.worktreePath,startedAt:now});this.d.leases.markRunning(jobId)
    await this.d.startProcess({jobId,recipe,worktreePath:worker.worktreePath});this.d.crashHook?.("after_process_start")
    if(input.candidateFactory&&!this.d.candidates.firstForJob(jobId)){const candidate=input.candidateFactory({jobId,recipe});this.d.candidates.insert({...candidate,proofJobId:jobId,compileResult:"PENDING",diagnostics:[],axioms:[],forbidden:[],verificationReportId:null,status:"CREATED",score:0,createdAt:now})}
    if(input.candidateFactory)this.d.crashHook?.("after_candidate_write")
  }
}

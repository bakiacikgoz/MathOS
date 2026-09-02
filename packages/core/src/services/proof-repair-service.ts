import { declarationsMatch,scanForbidden,type FailureOccurrenceDraft,type ProofCandidateEvaluation } from "@mathos/domain"
import { PROOF_REPAIR_SYSTEM_PROMPT } from "../proof-repair-prompt.ts"

export interface ProofRepairInput{formalDeclaration:string;failedProof:string;failureClass:string;diagnostics:Array<{message:string}>;allowedPremises:string[];goalHash:string;contextHash:string;premiseSetHash:string;maxAttempts:number;signal?:AbortSignal}
export interface ProofRepairResult{status:"KERNEL_ACCEPTED"|"REJECTED";reason:string|null;proofSource:string|null;attempts:number;diagnostics:Array<{message:string}>}
export interface ProofRepairDependencies{
  repair(input:{system:string;formalDeclaration:string;failedProof:string;diagnostics:string;allowedPremises:string[];attempt:number;signal?:AbortSignal}):Promise<{proofSource:string}>
  compile(source:string,signal?:AbortSignal):Promise<ProofCandidateEvaluation>
  rememberFailure(draft:FailureOccurrenceDraft):{duplicate:boolean}
  consumeBudget(resource:"MODEL_CALL"|"LEAN_CALL"):boolean
  now():string
}
export class ProofRepairService{
  constructor(private readonly d:ProofRepairDependencies){}
  async repair(input:ProofRepairInput):Promise<ProofRepairResult>{
    const hardMax=Math.min(5,Math.max(0,input.maxAttempts)),base:FailureOccurrenceDraft={domain:"PROOF",failureClass:input.failureClass,diagnostic:input.diagnostics.map(item=>item.message).join("\n"),attemptedApproach:"VERIFIER_GUIDED_REPAIR",goalHash:input.goalHash,contextHash:input.contextHash,premiseSetHash:input.premiseSetHash}
    if(this.d.rememberFailure(base).duplicate)return{status:"REJECTED",reason:"REPEATED_FAILURE_FINGERPRINT",proofSource:null,attempts:0,diagnostics:input.diagnostics}
    let previous=input.failedProof,diagnostics=input.diagnostics
    for(let attempt=1;attempt<=hardMax;attempt++){
      if(input.signal?.aborted)return{status:"REJECTED",reason:"REPAIR_TIMEOUT",proofSource:null,attempts:attempt-1,diagnostics}
      if(!this.d.consumeBudget("MODEL_CALL"))return{status:"REJECTED",reason:"PORTFOLIO_BUDGET_EXHAUSTED",proofSource:null,attempts:attempt-1,diagnostics}
      let proofSource:string
      try{proofSource=(await this.d.repair({system:PROOF_REPAIR_SYSTEM_PROMPT,formalDeclaration:input.formalDeclaration,failedProof:previous,diagnostics:diagnostics.map(item=>item.message).join("\n"),allowedPremises:[...input.allowedPremises],attempt,signal:input.signal})).proofSource}
      catch(error){if(error instanceof DOMException&&(error.name==="TimeoutError"||error.name==="AbortError"))return{status:"REJECTED",reason:"REPAIR_TIMEOUT",proofSource:null,attempts:attempt-1,diagnostics};throw error}
      if(!declarationsMatch(input.formalDeclaration,proofSource))return{status:"REJECTED",reason:"STATEMENT_MUTATED",proofSource,attempts:attempt,diagnostics}
      if(scanForbidden(proofSource).length)return{status:"REJECTED",reason:"FORBIDDEN_CONSTRUCT",proofSource,attempts:attempt,diagnostics}
      if(!this.d.consumeBudget("LEAN_CALL"))return{status:"REJECTED",reason:"PORTFOLIO_BUDGET_EXHAUSTED",proofSource:null,attempts:attempt-1,diagnostics}
      let checked:ProofCandidateEvaluation
      try{checked=await this.d.compile(proofSource,input.signal)}catch(error){if(error instanceof DOMException&&(error.name==="TimeoutError"||error.name==="AbortError"))return{status:"REJECTED",reason:"REPAIR_TIMEOUT",proofSource:null,attempts:attempt,diagnostics};throw error}
      diagnostics=checked.diagnostics.map(item=>({message:item.message}))
      if(checked.result==="KERNEL_ACCEPTED"&&checked.axioms.length===0)return{status:"KERNEL_ACCEPTED",reason:null,proofSource,attempts:attempt,diagnostics}
      const occurrence={...base,diagnostic:diagnostics.map(item=>item.message).join("\n")||base.diagnostic}
      if(this.d.rememberFailure(occurrence).duplicate)return{status:"REJECTED",reason:"REPEATED_FAILURE_FINGERPRINT",proofSource,attempts:attempt,diagnostics}
      previous=proofSource
    }
    return{status:"REJECTED",reason:"MAX_REPAIR_ATTEMPTS",proofSource:previous,attempts:hardMax,diagnostics}
  }
}

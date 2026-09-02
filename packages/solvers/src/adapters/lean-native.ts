import type { LeanAdapter } from "@mathos/lean"
export interface LeanSolverRequest{formalDeclaration:string;tactic:string;workspaceRoot:string;tmpDir?:string;signal?:AbortSignal}
export class LeanNativeSolver{
  readonly descriptor={id:"lean-native",version:"1",kind:"NATIVE" as const,problemKinds:["LEAN_TACTIC"],maxTrustClass:"LEAN_REPLAYED" as const,requiresSandbox:false,requiresNetwork:false}
  constructor(private readonly lean:LeanAdapter){}
  async solve(input:LeanSolverRequest){const candidateProof=`${input.formalDeclaration.trim().replace(/\s*:=\s*$/," ")} := ${input.tactic.trim()}`.replace(/\s+:=/," :=");const checked=await this.lean.checkProof(candidateProof,{workspaceRoot:input.workspaceRoot,tmpDir:input.tmpDir,signal:input.signal});return{outcome:checked.result==="KERNEL_ACCEPTED"?"SUPPORT" as const:"ERROR" as const,trustClass:"UNTRUSTED" as const,candidateProof:checked.result==="KERNEL_ACCEPTED"?candidateProof:null,diagnostics:checked.diagnostics,leanVersion:checked.leanVersion,toolchain:checked.toolchain,requiresVerificationGate:true}}
}

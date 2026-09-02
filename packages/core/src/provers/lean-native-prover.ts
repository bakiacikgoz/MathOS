import { createHash } from "node:crypto"
import type { ProverAdapter,ProverRequest } from "../services/prover-registry.ts"
export class LeanNativeProver implements ProverAdapter{
  readonly descriptor={id:"lean-native",kind:"LEAN_NATIVE" as const,version:"1",capabilities:{plans:false,generatesProof:true,repairsProof:false,streams:false,requiresNetwork:false},health:"READY" as const};readonly languages=["lean4"]
  constructor(private readonly tactics:readonly string[]=["rfl","simp","aesop"]){if(tactics.some((tactic)=>!/^[A-Za-z0-9_ .\[\],'-]+$/.test(tactic)))throw new Error("UNSAFE_NATIVE_TACTIC")}
  async generate(request:ProverRequest){const tactic=this.tactics[0]??"rfl",proofSource=`${request.formalSource.trim()} := by\n  ${tactic}`;return{proofSource,artifactHash:createHash("sha256").update(proofSource).digest("hex"),strategy:"lean_native_suggestions"}}
}

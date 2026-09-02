import { OptionalProcessSolver,type OptionalSolverIo,type OptionalSolverRunner } from "./optional-process.ts"
export class GapSolver extends OptionalProcessSolver{constructor(executable:string,runner:OptionalSolverRunner,io:OptionalSolverIo){super({id:"gap",version:"1",executable,problemKinds:["FINITE_GROUP","GROUP_COUNTEREXAMPLE"],maxTrustClass:"WITNESS_CHECKED"},runner,io)}}

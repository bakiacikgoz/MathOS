import { OptionalProcessSolver,type OptionalSolverIo,type OptionalSolverRunner } from "./optional-process.ts"
export class Cvc5Solver extends OptionalProcessSolver{constructor(executable:string,runner:OptionalSolverRunner,io:OptionalSolverIo){super({id:"cvc5",version:"1",executable,problemKinds:["SMT","SAT","UNSAT"],maxTrustClass:"CERTIFICATE_CHECKED"},runner,io)}}

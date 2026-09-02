import { OptionalProcessSolver,type OptionalSolverIo,type OptionalSolverRunner } from "./optional-process.ts"
export class SageSolver extends OptionalProcessSolver{constructor(executable:string,runner:OptionalSolverRunner,io:OptionalSolverIo){super({id:"sage",version:"1",executable,problemKinds:["EXACT_ARITHMETIC","SYMBOLIC_ALGEBRA","NUMBER_THEORY"],maxTrustClass:"WITNESS_CHECKED"},runner,io)}}

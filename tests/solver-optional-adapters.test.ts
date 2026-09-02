import { describe,expect,test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { SageSolver } from "../packages/solvers/src/adapters/sage.ts"
import { GapSolver } from "../packages/solvers/src/adapters/gap.ts"
import { Cvc5Solver } from "../packages/solvers/src/adapters/cvc5.ts"
const fixture=(name:string)=>readFileSync(resolve(import.meta.dir,"fixtures/solvers",name),"utf8")
function runner(stdout:string,options:{available?:boolean;timedOut?:boolean;exitCode?:number}={}){const calls:any[]=[];return{calls,runner:{available:async()=>options.available??true,version:async()=>"fake 1.0",run:async(input:any)=>{calls.push(input);return{stdout,stderr:options.exitCode?"failed":"",exitCode:options.exitCode??0,timedOut:options.timedOut??false}}}}}
const io={createSandboxRoot:()=>"C:\\sandbox\\job-1",writeRequest:(_root:string,_name:string,_data:string)=>"C:\\sandbox\\job-1\\request.json"}
describe("optional solver adapters",()=>{
  test("detects versions and unavailable binaries",async()=>{const absent=runner("",{available:false});expect((await new SageSolver("sage",absent.runner,io).doctor()).health).toBe("UNAVAILABLE");const present=runner("");expect((await new Cvc5Solver("cvc5",present.runner,io).doctor()).version).toBe("fake 1.0")})
  test("Sage uses argv, sandbox request files, and hashes",async()=>{const fake=runner(fixture("sage-success.json"));const result=await new SageSolver("sage",fake.runner,io).solve({problemKind:"EXACT_ARITHMETIC",payload:{expression:"1/3"},timeoutMs:100});expect(result.outcome).toBe("SUPPORT");expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/);expect(result.outputHash).toMatch(/^[a-f0-9]{64}$/);expect(fake.calls[0].argv).toEqual(["C:\\sandbox\\job-1\\request.json"]);expect(fake.calls[0].cwd).toBe("C:\\sandbox\\job-1")})
  test("GAP captures a counterexample witness",async()=>{const result=await new GapSolver("gap",runner(fixture("gap-witness.json")).runner,io).solve({problemKind:"FINITE_GROUP",payload:{},timeoutMs:100});expect(result.outcome).toBe("COUNTEREXAMPLE");expect(result.witness).toEqual({element:"a"});expect(result.trustClass).toBe("UNTRUSTED")})
  test("cvc5 captures certificates without self-certifying them",async()=>{const result=await new Cvc5Solver("cvc5",runner(fixture("cvc5-certificate.json")).runner,io).solve({problemKind:"SMT",payload:{formula:"false"},timeoutMs:100});expect(result.outcome).toBe("UNSAT");expect(result.certificate).toContain("proof");expect(result.trustClass).toBe("UNTRUSTED")})
  test("handles timeout, nonzero exit, and malformed output",async()=>{expect((await new SageSolver("sage",runner("",{timedOut:true}).runner,io).solve({problemKind:"X",payload:{},timeoutMs:1})).errorCode).toBe("SOLVER_TIMEOUT");expect((await new GapSolver("gap",runner("",{exitCode:2}).runner,io).solve({problemKind:"X",payload:{},timeoutMs:1})).errorCode).toBe("SOLVER_EXIT_NONZERO");expect((await new Cvc5Solver("cvc5",runner("bad").runner,io).solve({problemKind:"X",payload:{},timeoutMs:1})).errorCode).toBe("MALFORMED_SOLVER_JSON")})
})

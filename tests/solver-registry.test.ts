import { describe,expect,test } from "bun:test"
import { SolverRegistry } from "../packages/solvers/src/registry.ts"

const adapter=(id="sympy")=>({id,version:"1",kind:"EXTERNAL" as const,executable:"./tools/../bin/sympy",problemKinds:["EXACT_ARITHMETIC"],maxTrustClass:"WITNESS_CHECKED" as const,requiresSandbox:true,requiresNetwork:false})
describe("solver registry",()=>{
  test("enforces id/version uniqueness and canonical executable paths",()=>{const registry=new SolverRegistry({root:"C:\\workspace",isExecutableAvailable:()=>true});const first=registry.register(adapter());expect(first.executable).toBe("C:\\workspace\\bin\\sympy");expect(()=>registry.register(adapter())).toThrow("SOLVER_ADAPTER_DUPLICATE")})
  test("reports unavailable capabilities without pretending readiness",()=>{const registry=new SolverRegistry({root:"C:\\workspace",isExecutableAvailable:()=>false});expect(registry.register(adapter()).health).toBe("UNAVAILABLE");expect(registry.availableFor("EXACT_ARITHMETIC")).toEqual([])})
  test("rejects external adapters that do not require a sandbox",()=>{const registry=new SolverRegistry({root:"C:\\workspace",isExecutableAvailable:()=>true});expect(()=>registry.register({...adapter(),requiresSandbox:false})).toThrow("EXTERNAL_SOLVER_SANDBOX_REQUIRED")})
})

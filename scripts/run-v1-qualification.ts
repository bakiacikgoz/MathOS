import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
const root=resolve(import.meta.dir,"..")
const baseline=JSON.parse(readFileSync(resolve(root,"benchmarks/v1-qualification-baseline.json"),"utf8"))
export type QualificationResult={id:string;status:"PASS"|"FAIL"|"SKIPPED";evidence:string}
export function evaluateQualification(results:QualificationResult[]){
  const by=new Map(results.map(r=>[r.id,r]))
  const checks=baseline.requiredCheckIds.map((id:string)=>by.get(id)??{id,status:"FAIL",evidence:"MISSING_REQUIRED_RESULT"})
  const blockers=checks.filter((r:any)=>r.status!=="PASS").map((r:any)=>`${r.id}:${r.status}:${r.evidence}`)
  return{schemaVersion:"mathos-v1-qualification-v1",version:JSON.parse(readFileSync(resolve(root,"package.json"),"utf8")).version,gitRevision:"TEST",schemaEpoch:30,checks,conditionalSignals:["real-model-benchmark","live-literature-providers","optional-solvers","linux-windows-evidence"],blockers,ready:blockers.length===0}
}
const commands:Record<string,string[]>={
  "typecheck-build":["tests/v1-domain-contracts.test.ts"],
  "deterministic-tests":["tests/professional-workflow-eval.test.ts","tests/alignment-eval.test.ts","tests/portfolio-eval.test.ts"],
  "migration-compatibility":["tests/release.test.ts"],
  "verification-authority":["tests/verification-authority.test.ts","tests/verification-trust.test.ts"],
  "sandbox-security":["tests/sandbox-security.test.ts"],
  "bridge-security":["tests/bridge-security.test.ts"],
  "plugin-security":["tests/plugin-manifest.test.ts","tests/plugin-process-host.test.ts","tests/plugin-adapters.test.ts"],
  "capsule-security":["tests/capsule-manifest.test.ts","tests/capsule-roundtrip.test.ts","tests/capsule-replay.test.ts"],
  "atlas-security":["tests/atlas-server-security.test.ts"],
  "professional-workflows":["tests/professional-workflow-eval.test.ts"],
}
function staticScan(pattern:string){return execFileSync("git",["grep","-nE",pattern],{cwd:root,encoding:"utf8"})}
function run(){
  const results:QualificationResult[]=[]
  for(const id of baseline.requiredCheckIds as string[]){
    try{
      if(id==="typecheck-build"){execFileSync(process.execPath,["run","typecheck:all"],{cwd:root,stdio:"pipe"});execFileSync(process.execPath,["run","build"],{cwd:root,stdio:"pipe"})}
      else if(id==="deterministic-tests")execFileSync(process.execPath,["test",...commands[id]!],{cwd:root,stdio:"pipe",maxBuffer:16*1024*1024})
      else if(commands[id])execFileSync(process.execPath,["test",...commands[id]],{cwd:root,stdio:"pipe"})
      else if(id==="portable-paths"){const out=staticScan(["C:","\\\\Users\\\\"].join(""));if(out.trim())throw new Error(out)}
      else if(id==="secret-fixtures"){const pattern=["BEGIN ","(RSA |EC |OPENSSH )?","PRIVATE KEY","|","sk-","[A-Za-z0-9_-]{20,}"].join("");const out=staticScan(pattern);if(out.trim())throw new Error("raw secret-like fixture")}
      else if(id==="documentation-boundary"){const text=readFileSync(resolve(root,"README.md"),"utf8");if(/automatic open problem solver|unrestricted proof/i.test(text))throw new Error("forbidden product claim")}
      results.push({id,status:"PASS",evidence:"deterministic evidence passed"})
    }catch(error:any){
      if(error?.status===1&&(id==="portable-paths"||id==="secret-fixtures"))results.push({id,status:"PASS",evidence:"static scan clean"})
      else results.push({id,status:"FAIL",evidence:String(error?.message??error).slice(0,300)})
    }
  }
  const report=evaluateQualification(results)
  try{report.gitRevision=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim()}catch{}
  mkdirSync(resolve(root,"artifacts/qualification"),{recursive:true})
  writeFileSync(resolve(root,"artifacts/qualification/v1-latest.json"),JSON.stringify(report,null,2))
  writeFileSync(resolve(root,"artifacts/qualification/v1-latest.md"),`# MathOS V1 Qualification\n\nReady: ${report.ready}\n\n${report.checks.map((c:any)=>`- ${c.id}: ${c.status}`).join("\n")}\n\nBlockers: ${report.blockers.join(", ")||"none"}\n`)
  return report
}
if(import.meta.main){const report=run();console.log(JSON.stringify(report,null,2));if(!report.ready)process.exit(1)}

#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { SCHEMA_EPOCH } from "@mathos/storage"

export interface BaselineCommandResult { exitCode:number; stdout:string; stderr:string }
export type BaselineCommandRunner=(command:string[],options:{cwd:string})=>Promise<BaselineCommandResult>
export interface ProductBaseline {
  schemaVersion:"mathos-product-completion-baseline-v1"
  baselineReference:"541e39ef6454ffd7b3934348ccb457f067b28f31"
  gitRevision:string
  versions:{product:string;schema:number;bridge:number;pluginApi:number;capsule:number;publication:number}
  checks:Array<{id:string;status:"PASS"|"FAIL";evidence:string}>
  capabilities:{doctorEvidence:string}
  ready:boolean
}

const defaultRunner:BaselineCommandRunner=async(command,options)=>{
  const proc=Bun.spawn(command,{cwd:options.cwd,stdin:"ignore",stdout:"pipe",stderr:"pipe",env:{...process.env,NO_COLOR:"1",FORCE_COLOR:"0"}})
  const [exitCode,stdout,stderr]=await Promise.all([proc.exited,new Response(proc.stdout).text(),new Response(proc.stderr).text()])
  return{exitCode,stdout,stderr}
}

function evidence(result:BaselineCommandResult):string {
  return (result.stderr||result.stdout||"command produced no output").trim().slice(-2_000)
}

export async function captureProductBaseline(options:{root?:string;runner?:BaselineCommandRunner;write?:(path:string,data:string)=>void}={}):Promise<ProductBaseline>{
  const root=resolve(options.root??join(import.meta.dir,"..","..")),runner=options.runner??defaultRunner,bun=process.execPath
  const packageJson=JSON.parse(readFileSync(join(root,"package.json"),"utf8"))as{version:string}
  const commands:Array<[string,string[]]>=[
    ["version",[bun,"apps/tui/src/cli.ts","--version"]],
    ["typecheck",[bun,"run","typecheck:all"]],
    ["tests",[bun,"test"]],
    ["build",[bun,"run","build"]],
    ["atlas-build",[bun,"run","build:atlas"]],
    ["vscode-build",[bun,"run","build:vscode"]],
    ["release-check",[bun,"run","release-check"]],
    ["qualification-v1",[bun,"scripts/run-v1-qualification.ts","--json"]],
  ]
  const revision=await runner(["git","rev-parse","HEAD"],{cwd:root})
  const checks=[] as ProductBaseline["checks"]
  for(const[id,command]of commands){const result=await runner(command,{cwd:root});checks.push({id,status:result.exitCode===0?"PASS":"FAIL",evidence:evidence(result)})}
  const report:ProductBaseline={
    schemaVersion:"mathos-product-completion-baseline-v1",
    baselineReference:"541e39ef6454ffd7b3934348ccb457f067b28f31",
    gitRevision:revision.exitCode===0?revision.stdout.trim():"UNKNOWN",
    versions:{product:packageJson.version,schema:SCHEMA_EPOCH,bridge:1,pluginApi:1,capsule:1,publication:1},
    checks,
    capabilities:{doctorEvidence:"Fresh-workspace capability state is recorded by pilot-validation; unavailable external capabilities remain BLOCKED."},
    ready:revision.exitCode===0&&/^[0-9a-f]{40}$/u.test(revision.stdout.trim())&&checks.every(check=>check.status==="PASS"),
  }
  const output=join(root,"artifacts","product-completion","baseline.json")
  const data=JSON.stringify(report,null,2)+"\n"
  if(options.write)options.write(output,data);else{mkdirSync(dirname(output),{recursive:true});writeFileSync(output,data)}
  return report
}

if(import.meta.main){const report=await captureProductBaseline();console.log(JSON.stringify(report,null,2));if(!report.ready)process.exitCode=1}

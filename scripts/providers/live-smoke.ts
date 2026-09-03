#!/usr/bin/env bun
import { execFileSync } from "node:child_process"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { createProviderFromProfile, createSecretStore, discoverCodexExecutable, evaluateProviderPolicy, loadModelProfileStore, probeCodexVersion, providerCatalog, validateCodexSchema, type ModelProfileV2, type ModelProvider, type ProviderFactoryOptions } from "@mathos/models"
import { resolveRuntimeLayout } from "@mathos/shared"

export interface ProviderLiveResult { schemaVersion:"mathos.provider-live-smoke.v1";platform:string;mathosRevision:string;providerDescriptor:string;profile:string;clientVersion:string|null;transport:string;authOwner:string;model:string;connection:string;modelList:string;quota:string;liveRequest:string;usage:unknown;termsPolicy:string }
type LiveProvider = ModelProvider & { connect?:()=>Promise<unknown>;models?:()=>Promise<unknown>;rateLimits?:()=>Promise<unknown>;close?:()=>Promise<void> }
type LiveSmokeOptions = { profiles?:ModelProfileV2[];createProvider?:(profile:ModelProfileV2,options:ProviderFactoryOptions)=>Promise<LiveProvider> }

function revision(){try{return execFileSync("git",["rev-parse","HEAD"],{cwd:resolve(import.meta.dir,"../.."),encoding:"utf8"}).trim()}catch{return"UNKNOWN"}}
export async function codexOptions():Promise<ProviderFactoryOptions["codex"]>{
  const executable=discoverCodexExecutable({platform:process.platform});if(!executable)throw new Error("CODEX_CLIENT_MISSING")
  const version=await probeCodexVersion(executable);if(!version.compatible)throw new Error("CODEX_VERSION_INCOMPATIBLE")
  const output=mkdtempSync(join(tmpdir(),"mathos-codex-schema-"))
  try{const child=Bun.spawn([executable,"app-server","generate-json-schema","--out",output],{stdin:"ignore",stdout:"pipe",stderr:"pipe"});const stderrPromise=new Response(child.stderr).text(),exitCode=await child.exited,stderr=await stderrPromise;if(exitCode!==0)throw new Error(`CODEX_SCHEMA_GENERATION_FAILED${stderr.trim()?`: ${stderr.trim()}`:""}`);const schema=JSON.parse(readFileSync(join(output,"codex_app_server_protocol.v2.schemas.json"),"utf8"));validateCodexSchema(schema);return{executable,schema,version:version.version}}finally{rmSync(output,{recursive:true,force:true})}
}
function validSmoke(text:string):boolean{try{return JSON.parse(text).mathos_live_provider_smoke===true}catch{return false}}

export async function runProviderLiveSmoke(argv:string[],options:LiveSmokeOptions={}):Promise<ProviderLiveResult>{
  if(argv.some(value=>/^(--api-key|--token|--secret|--password|--value)(=|$)/i.test(value)))throw new Error("LIVE_SMOKE_SECRET_ARG_FORBIDDEN")
  const profileId=argv.find(value=>!value.startsWith("--"));if(!profileId)throw new Error("LIVE_SMOKE_PROFILE_REQUIRED")
  const layout=resolveRuntimeLayout({executablePath:process.execPath,platform:process.platform,home:homedir(),env:process.env}),profiles=options.profiles??loadModelProfileStore(join(layout.userConfigRoot,"model-profiles.json")).profiles,profile=profiles.find(row=>row.id===profileId)
  if(!profile)throw new Error(`MODEL_PROFILE_NOT_FOUND: ${profileId}`)
  const descriptor=providerCatalog.get(profile.descriptorId);if(!descriptor)throw new Error(`PROVIDER_DESCRIPTOR_NOT_FOUND: ${profile.descriptorId}`)
  const policy=evaluateProviderPolicy(descriptor.id),base={schemaVersion:"mathos.provider-live-smoke.v1" as const,platform:`${process.platform}-${process.arch}`,mathosRevision:revision(),providerDescriptor:descriptor.id,profile:profile.id,clientVersion:null,transport:descriptor.transport,authOwner:profile.auth.kind,model:profile.model,modelList:"NOT_RUN",quota:"NOT_RUN",usage:null,termsPolicy:descriptor.terms.policy}
  if(!policy.allowed)return{...base,connection:"POLICY_BLOCKED_EXPECTED",liveRequest:"POLICY_BLOCKED_EXPECTED"}
  if(!argv.includes("--live"))return{...base,connection:"NOT_CONFIGURED",liveRequest:"NOT_REQUESTED"}
  if(descriptor.billingClass==="payg"&&!argv.includes("--accept-usage"))throw new Error("LIVE_USAGE_ACCEPTANCE_REQUIRED")
  if(profile.model==="auto")return{...base,connection:"NOT_CONFIGURED",liveRequest:"MODEL_UNRESOLVED"}
  const secrets=createSecretStore();if(profile.auth.kind==="secret-ref"&&!await secrets.get(profile.auth.secretRef))return{...base,connection:"NOT_CONFIGURED",liveRequest:"NOT_CONFIGURED"}
  let provider:LiveProvider|undefined
  try{
    const factoryOptions:ProviderFactoryOptions={secrets,live:true,acceptUsage:argv.includes("--accept-usage")}
    if(profile.descriptorId==="openai-codex-chatgpt"&&!options.createProvider)factoryOptions.codex=await codexOptions()
    provider=await (options.createProvider??createProviderFromProfile)(profile,factoryOptions) as LiveProvider
    await provider.connect?.()
    const modelList=provider.models?await provider.models().then(()=>"PASS").catch(()=>"ERROR"):"NOT_SUPPORTED"
    const quota=provider.rateLimits?await provider.rateLimits().then(()=>"PASS").catch(()=>"ERROR"):"NOT_SUPPORTED"
    const response=await provider.generate({messages:[{role:"user",content:'Return exactly this JSON object and no markdown: {"mathos_live_provider_smoke":true}'}],maxOutputTokens:32})
    return{...base,clientVersion:factoryOptions.codex?.version??null,connection:"CONNECTED",modelList,quota,liveRequest:validSmoke(response.text)?"PASS":"INVALID_STRUCTURED_RESPONSE",usage:response.usage??null}
  }catch(error){return{...base,connection:"ERROR",liveRequest:error instanceof Error?error.message:"ERROR"}}
  finally{await provider?.close?.()}
}
if(import.meta.main){runProviderLiveSmoke(process.argv.slice(2)).then(report=>process.stdout.write(`${JSON.stringify(report,null,2)}\n`)).catch(error=>{process.stderr.write(`${error instanceof Error?error.message:String(error)}\n`);process.exit(1)})}

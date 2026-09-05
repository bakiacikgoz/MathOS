import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { runProviderContracts } from "../scripts/providers/contract-test.ts"
import { runProviderLiveSmoke } from "../scripts/providers/live-smoke.ts"
import * as liveSmokeModule from "../scripts/providers/live-smoke.ts"
import type { ModelProfileV2 } from "@mathos/models"

const profile=(id:string,descriptorId:string):ModelProfileV2=>{const now=new Date().toISOString();return{schemaVersion:"mathos.model-profile.v2",id,descriptorId,displayName:id,model:"test-model",endpointPresetId:null,baseUrlOverride:null,auth:{kind:"secret-ref",secretRef:`model.${id}`},enabled:true,timeoutMs:1000,maxResponseBytes:1000,maxOutputTokens:8,reasoningEffort:null,allowedRoles:["planner"],requestConcurrency:1,metadata:{createdAt:now,updatedAt:now,migratedFromV1:false}}}

describe("provider qualification",()=>{
  test("CLI exits after flushing a live qualification report",()=>{
    const source=readFileSync(resolve(import.meta.dir,"../scripts/providers/qualification.ts"),"utf8")
    expect(source).toMatch(/process\.stdout\.write\([^]*?\(\)=>process\.exit\(/)
  })
  test("binds live evidence to the executable build revision",()=>{
    const providerSmokeRevision=(liveSmokeModule as any).providerSmokeRevision
    expect(typeof providerSmokeRevision).toBe("function")
    expect(providerSmokeRevision({gitRevision:"ff8b1aa8944ca8498aee52647608f8de1a3947d6"})).toBe("ff8b1aa8944ca8498aee52647608f8de1a3947d6")
  })
  test("contracts every descriptor offline and distinguishes expected policy blocks",()=>{const report=runProviderContracts();expect(report.offline).toBe(true);expect(report.rows.length).toBeGreaterThan(30);expect(report.rows.find(row=>row.descriptor==="google-antigravity-consumer")?.status).toBe("POLICY_BLOCKED_EXPECTED");expect(report.rows.find(row=>row.descriptor==="openai-api")?.status).toBe("PASS")})
  test("accepts only a profile name and never invents missing live evidence",async()=>{const payg=profile("payg","openai-api");await expect(runProviderLiveSmoke(["payg","--api-key","canary"],{profiles:[payg]})).rejects.toThrow("LIVE_SMOKE_SECRET_ARG_FORBIDDEN");await expect(runProviderLiveSmoke(["payg","--live"],{profiles:[payg]})).rejects.toThrow("LIVE_USAGE_ACCEPTANCE_REQUIRED");const result=await runProviderLiveSmoke(["payg"],{profiles:[payg]});expect(result).toMatchObject({connection:"NOT_CONFIGURED",liveRequest:"NOT_REQUESTED",usage:null})})
  test("reports prohibited providers as expected policy blocks, not live passes",async()=>{const result=await runProviderLiveSmoke(["blocked","--live"],{profiles:[profile("blocked","google-antigravity-consumer")]});expect(result).toMatchObject({connection:"POLICY_BLOCKED_EXPECTED",liveRequest:"POLICY_BLOCKED_EXPECTED"});expect(JSON.stringify(result)).not.toContain("model.blocked")})
  test("connects, discovers models and quota, and requires a structured live response",async()=>{const codex={...profile("codex","openai-codex-chatgpt"),model:"codex-test",auth:{kind:"upstream-client",accountAlias:null,clientHome:null}} as ModelProfileV2;const calls:string[]=[];const result=await runProviderLiveSmoke(["codex","--live"],{profiles:[codex],createProvider:async()=>({id:"fake",model:"codex-test",capabilities:{structuredOutput:false,toolCalling:false,reasoning:true,streaming:false,vision:false},connect:async()=>{calls.push("connect")},models:async()=>({data:[{id:"codex-test"}]}),rateLimits:async()=>({remaining:42}),generate:async(request:any)=>{calls.push(request.messages[0].content);return{text:'{"mathos_live_provider_smoke":true}',provider:"fake",model:"codex-test"}},close:async()=>{calls.push("close")}} as any)});expect(calls).toEqual(["connect",expect.stringContaining("mathos_live_provider_smoke"),"close"]);expect(result).toMatchObject({connection:"CONNECTED",modelList:"PASS",quota:"PASS",liveRequest:"PASS"})})
  test("does not report PASS for an unstructured or false completion",async()=>{const codex={...profile("codex-bad","openai-codex-chatgpt"),model:"codex-test",auth:{kind:"upstream-client",accountAlias:null,clientHome:null}} as ModelProfileV2;const result=await runProviderLiveSmoke(["codex-bad","--live"],{profiles:[codex],createProvider:async()=>({id:"fake",model:"codex-test",capabilities:{},connect:async()=>{},generate:async()=>({text:"OK",provider:"fake",model:"codex-test"}),close:async()=>{}} as any)});expect(result.connection).toBe("CONNECTED");expect(result.liveRequest).toBe("INVALID_STRUCTURED_RESPONSE")})
})

test("an explicitly requested live qualification fails when the live gate fails", async () => {
  const { qualificationExitCode } = await import("../scripts/providers/qualification.ts") as any
  expect(typeof qualificationExitCode).toBe("function")
  expect(qualificationExitCode({ contract: { passed: true }, qualified: false }, ["--profile", "codex", "--live"])).toBe(1)
  expect(qualificationExitCode({ contract: { passed: true }, qualified: true }, ["--profile", "codex", "--live"])).toBe(0)
  expect(qualificationExitCode({ contract: { passed: false }, qualified: false }, [])).toBe(1)
  expect(qualificationExitCode({ contract: { passed: true }, qualified: false }, ["--json"])).toBe(0)
  expect(qualificationExitCode({ contract: { passed: true }, qualified: false }, ["--live"])).toBe(1)
})

import { describe, expect, test } from "bun:test"
import { runProviderContracts } from "../scripts/providers/contract-test.ts"
import { runProviderLiveSmoke } from "../scripts/providers/live-smoke.ts"
import type { ModelProfileV2 } from "@mathos/models"

const profile=(id:string,descriptorId:string):ModelProfileV2=>{const now=new Date().toISOString();return{schemaVersion:"mathos.model-profile.v2",id,descriptorId,displayName:id,model:"test-model",endpointPresetId:null,baseUrlOverride:null,auth:{kind:"secret-ref",secretRef:`model.${id}`},enabled:true,timeoutMs:1000,maxResponseBytes:1000,maxOutputTokens:8,reasoningEffort:null,allowedRoles:["planner"],requestConcurrency:1,metadata:{createdAt:now,updatedAt:now,migratedFromV1:false}}}

describe("provider qualification",()=>{
  test("contracts every descriptor offline and distinguishes expected policy blocks",()=>{const report=runProviderContracts();expect(report.offline).toBe(true);expect(report.rows.length).toBeGreaterThan(30);expect(report.rows.find(row=>row.descriptor==="google-antigravity-consumer")?.status).toBe("POLICY_BLOCKED_EXPECTED");expect(report.rows.find(row=>row.descriptor==="openai-api")?.status).toBe("PASS")})
  test("accepts only a profile name and never invents missing live evidence",async()=>{const payg=profile("payg","openai-api");await expect(runProviderLiveSmoke(["payg","--api-key","canary"],{profiles:[payg]})).rejects.toThrow("LIVE_SMOKE_SECRET_ARG_FORBIDDEN");await expect(runProviderLiveSmoke(["payg","--live"],{profiles:[payg]})).rejects.toThrow("LIVE_USAGE_ACCEPTANCE_REQUIRED");const result=await runProviderLiveSmoke(["payg"],{profiles:[payg]});expect(result).toMatchObject({connection:"NOT_CONFIGURED",liveRequest:"NOT_REQUESTED",usage:null})})
  test("reports prohibited providers as expected policy blocks, not live passes",async()=>{const result=await runProviderLiveSmoke(["blocked","--live"],{profiles:[profile("blocked","google-antigravity-consumer")]});expect(result).toMatchObject({connection:"POLICY_BLOCKED_EXPECTED",liveRequest:"POLICY_BLOCKED_EXPECTED"});expect(JSON.stringify(result)).not.toContain("model.blocked")})
})

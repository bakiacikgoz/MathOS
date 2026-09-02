import { expect, test } from "bun:test"
import { createAtlasHandler } from "@mathos/core"
import { providerCatalog, redactedProviderSummary, type ModelProfileV2 } from "@mathos/models"
import { renderProviderSettingsHtml } from "../apps/atlas/src/App.tsx"

test("Atlas provider endpoint returns only the redacted settings summary", async () => {
  const descriptor=providerCatalog.get("openai-api")!, now=new Date().toISOString(), profile:ModelProfileV2={schemaVersion:"mathos.model-profile.v2",id:"main",descriptorId:descriptor.id,displayName:"Main",model:"gpt-5",endpointPresetId:"responses",baseUrlOverride:null,auth:{kind:"secret-ref",secretRef:"model.main"},enabled:true,timeoutMs:1000,maxResponseBytes:1000,maxOutputTokens:null,reasoningEffort:null,allowedRoles:["planner"],requestConcurrency:1,metadata:{createdAt:now,updatedAt:now,migratedFromV1:false}}
  const summary=redactedProviderSummary(profile,descriptor,{connection:"CONNECTED",quota:"unknown"})
  const handler=createAtlasHandler({token:"atlas-token",snapshot:()=>({nodes:[],edges:[],coverage:{}} as never),providers:()=>[summary]})
  const response=await handler(new Request("http://127.0.0.1/providers",{headers:{authorization:"Bearer atlas-token"}})), text=await response.text(), value=JSON.parse(text)
  expect(response.status).toBe(200); expect(value[0]).toEqual({profile:"main",descriptor:"openai-api",connection:"CONNECTED",model:"gpt-5",billing:"payg",terms:"STANDARD_API",quota:"unknown",roles:["planner"]})
  expect(text).not.toMatch(/secretRef|model\.main|apiKey|email/i)
  const html=renderProviderSettingsHtml([summary]); expect(html).toContain("Model providers"); expect(html).toContain("Billing"); expect(html).not.toContain("model.main")
})

import { describe, expect, test } from "bun:test"
import { assertSafeProviderUrl, buildExternalClientEnvironment, redactText, redactValue, validateModelProfileV2 } from "@mathos/models"

describe("provider security boundary", () => {
  test("recursively redacts headers, cookies, device codes and resists prototype input", () => {
    const malicious=JSON.parse('{"__proto__":{"polluted":true},"headers":{"authorization":"Bearer abcdefgh","cookie":"sid=abcdef"},"deviceCode":"ABCD-1234","nested":{"apiKey":"sk-abcdefghijk"}}')
    const output=redactValue(malicious) as Record<string,unknown>, text=JSON.stringify(output)
    expect(text).not.toMatch(/abcdefgh|abcdef|ABCD-1234/); expect(({} as {polluted?:boolean}).polluted).toBeUndefined(); expect(Object.prototype.hasOwnProperty.call(output,"__proto__")).toBe(false)
    expect(redactText("Cookie: sid=abc device_code=ZXCV Bearer token")).not.toMatch(/sid=abc|ZXCV|Bearer token/)
  })
  test("isolates process environment and rejects remote private, credential and unsafe URLs", () => {
    expect(buildExternalClientEnvironment({PATH:"/bin",HOME:"/tmp",MATHOS_API_KEY:"canary",NODE_OPTIONS:"--require evil"})).toEqual({PATH:"/bin",HOME:"/tmp"})
    for(const url of["http://127.0.0.1:8000/v1","https://10.0.0.1/v1","https://user:pass@example.test/v1","file:///tmp/socket"])expect(()=>assertSafeProviderUrl(url)).toThrow()
    expect(assertSafeProviderUrl("http://127.0.0.1:8000/v1",{allowLoopback:true}).hostname).toBe("127.0.0.1")
  })
  test("profile parser rejects a remote private endpoint", () => {
    const now=new Date().toISOString();expect(()=>validateModelProfileV2({schemaVersion:"mathos.model-profile.v2",id:"remote",descriptorId:"generic-openai-compatible",displayName:"Remote",model:"m",endpointPresetId:"openai-chat",baseUrlOverride:"https://192.168.1.10/v1",auth:{kind:"secret-ref",secretRef:"model.remote"},enabled:true,timeoutMs:1000,maxResponseBytes:1000,maxOutputTokens:null,reasoningEffort:null,allowedRoles:["planner"],requestConcurrency:1,metadata:{createdAt:now,updatedAt:now,migratedFromV1:false}})).toThrow("PROVIDER_PRIVATE_NETWORK_FORBIDDEN")
  })
})

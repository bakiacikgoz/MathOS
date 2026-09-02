import { expect, test } from "bun:test"
import { evaluateProviderPolicy } from "@mathos/models"
test("terms policy blocks prohibited retired and approval-required paths",()=>{
 expect(evaluateProviderPolicy("google-antigravity-consumer").allowed).toBe(false)
 expect(evaluateProviderPolicy("qwen-portal-oauth-legacy").code).toBe("PROVIDER_RETIRED")
 expect(evaluateProviderPolicy("zai-coding-plan").allowed).toBe(false)
 expect(evaluateProviderPolicy("zai-payg").allowed).toBe(true)
})
test("stale reviews warn but never open a prohibited path",()=>{const result=evaluateProviderPolicy("google-antigravity-consumer",new Date("2027-01-01T00:00:00Z"));expect(result.allowed).toBe(false);expect(result.warnings).toContain("PROVIDER_POLICY_REVIEW_STALE")})

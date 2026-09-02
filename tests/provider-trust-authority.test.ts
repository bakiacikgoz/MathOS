import { describe, expect, test } from "bun:test"
import { evaluateBillingTransition, evaluateProviderPolicy, providerCatalog } from "@mathos/models"

describe("provider trust authority", () => {
  test("prohibited and retired policies cannot be overridden", () => {
    for(const id of["google-antigravity-consumer","zai-coding-plan","qwen-portal-oauth-legacy"]){const descriptor=providerCatalog.get(id)!;expect(evaluateProviderPolicy(id).allowed).toBe(false);expect(descriptor.terms.userOverrideAllowed).toBe(false)}
  })
  test("never silently moves subscription or local work to PAYG remote", () => {
    const policy={allowBillingTransition:false,allowLocalToRemoteTransition:false}
    expect(evaluateBillingTransition({profileId:"sub",billingClass:"subscription",remote:true},{profileId:"payg",billingClass:"payg",remote:true},policy)).toMatchObject({allowed:false})
    expect(evaluateBillingTransition({profileId:"local",billingClass:"local",remote:false},{profileId:"payg",billingClass:"payg",remote:true},policy)).toMatchObject({allowed:false})
  })
})

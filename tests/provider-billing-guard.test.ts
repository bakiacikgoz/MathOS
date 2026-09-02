import { describe, expect, test } from "bun:test"
import { evaluateBillingTransition } from "@mathos/models"

describe("provider billing guard", () => {
  const deny = { allowBillingTransition: false, allowLocalToRemoteTransition: false }
  test("allows fallback within the same billing class", () => {
    expect(evaluateBillingTransition({ profileId: "a", billingClass: "subscription", remote: true }, { profileId: "b", billingClass: "subscription", remote: true }, deny)).toEqual({ allowed: true })
  })
  test("blocks subscription to PAYG without explicit consent", () => {
    expect(evaluateBillingTransition({ profileId: "a", billingClass: "subscription", remote: true }, { profileId: "b", billingClass: "payg", remote: true }, deny)).toEqual({ allowed: false, code: "BILLING_TRANSITION_BLOCKED" })
  })
  test("blocks local to remote without explicit privacy consent", () => {
    expect(evaluateBillingTransition({ profileId: "a", billingClass: "local", remote: false }, { profileId: "b", billingClass: "local", remote: true }, deny)).toEqual({ allowed: false, code: "LOCAL_TO_REMOTE_TRANSITION_BLOCKED" })
  })
})

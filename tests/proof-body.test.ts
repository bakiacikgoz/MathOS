import { expect, test } from "bun:test"
import { composeProof } from "@mathos/domain"
import { parseProofBody } from "@mathos/core"
import { proofSummary } from "../packages/core/src/assistant/tools.ts"

const statement = "theorem sum_odd (m n : ℤ) (hm : ∃ a : ℤ, m = 2 * a + 1) (hn : ∃ b : ℤ, n = 2 * b + 1) : ∃ c : ℤ, m + n = 2 * c"
const body = "by\n  obtain ⟨a, ha⟩ := hm\n  obtain ⟨b, hb⟩ := hn\n  refine ⟨a + b + 1, ?_⟩\n  rw [ha, hb]\n  ring"

test("a proof keeps the := inside its tactics; a repeated declaration is cut off", () => {
  expect(composeProof(statement, body)).toBe(`${statement} :=\n${body}`)
  expect(composeProof(statement, `${statement} := ${body}`)).toBe(`${statement} :=\n${body}`)
  expect(composeProof(statement, ":= by\n  simp")).toBe(`${statement} :=\nby\n  simp`)
})

test("the prover's body is read under any usual name, and a missing body is an error so the repair round runs", () => {
  for (const key of ["proofBody", "proof_body", "proof", "body"]) expect(parseProofBody({ [key]: ` ${body} ` })).toBe(body)
  expect(parseProofBody(body)).toBe(body)
  expect(() => parseProofBody({ proofbody: body })).toThrow()
  expect(() => parseProofBody({ proofBody: "by" })).toThrow()
  expect(() => parseProofBody(null)).toThrow()
})

test("a proof result reads as accepted, or as the proof tried with Lean's errors", () => {
  expect(proofSummary(JSON.stringify({ accepted: "PA-010", attempts: [{ id: "PA-010", status: "KERNEL_ACCEPTED" }], verificationPassed: true, claimStatus: "VERIFIED" }))).toStartWith("The Lean kernel accepted the proof (PA-010). Verified: yes.")
  const failed = proofSummary(JSON.stringify({ accepted: null, attempts: [{ id: "PA-1" }, { id: "PA-2" }], verificationPassed: false, claimStatus: "FORMALIZED_UNVERIFIED", lastAttempt: { proof: `${statement} :=\nby\n  simp`, diagnostics: ["unsolved goals", "⊢ ∃ c, m + n = 2 * c"] } }))
  expect(failed).toContain("No proof accepted after 2 attempts")
  expect(failed).toContain("Lean errors:\nunsolved goals")
})

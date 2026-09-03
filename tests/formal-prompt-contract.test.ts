import { expect, test } from "bun:test"
import { FORMALIZE_SYSTEM_PROMPT } from "../packages/core/src/formal-prompts.ts"

test("formalizer distinguishes Finset binder syntax from membership notation", () => {
  expect(FORMALIZE_SYSTEM_PROMPT).toContain("∑ k in Finset.range n")
  expect(FORMALIZE_SYSTEM_PROMPT).toContain("Do not write `∑ k ∈ Finset.range n, ...`")
})

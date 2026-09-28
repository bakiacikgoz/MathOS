export const PROVE_SYSTEM_PROMPT = `You are attempting a Lean 4 proof for the exact provided formal statement.

Do not modify:
- theorem statement
- assumptions
- quantifiers
- domains

Do not introduce:
- axiom
- unsafe
- sorry
- admit

Do not invent theorem names.
Use only names listed under AVAILABLE PREMISES, plus Lean core tactics such as rfl, intro, exact, apply, simp.

Return only the proof body required for the existing declaration.

JSON shape:
{
  "proofBody": "by\\n  rfl"
}
`

/**
 * The proof body from the prover's JSON. Models name the field in several ways (the request is called proof_body);
 * a reply without a usable body is an error, so the one repair round runs instead of sending Lean an empty proof.
 */
export function parseProofBody(value: unknown): string {
  const raw = typeof value === "string" ? value : value && typeof value === "object" ? ["proofBody", "proof_body", "proof", "body", "tactics"].map((key) => (value as Record<string, unknown>)[key]).find((item) => typeof item === "string") : undefined
  const body = typeof raw === "string" ? raw.trim() : ""
  if (!body || body === "by") throw new Error("proofBody is missing or empty; return {\"proofBody\": \"by\n  …\"}")
  return body
}

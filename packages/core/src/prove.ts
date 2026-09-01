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

export function parseProofBody(value: unknown): string {
  if (!value || typeof value !== "object") return ""
  const raw = value as Record<string, unknown>
  return String(raw.proofBody ?? raw.proof ?? "").trim()
}

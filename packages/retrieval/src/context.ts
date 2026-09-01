import type { GoalProfile, PremiseCandidate, RetrievalConfig } from "./types.ts"
import { DEFAULT_RETRIEVAL_CONFIG } from "./types.ts"

export function buildProofContext(input: {
  formalStatement: string
  naturalStatement?: string
  diagnostics?: string
  premises: PremiseCandidate[]
  goalProfile?: GoalProfile
  config?: RetrievalConfig
}): string {
  const config = input.config ?? DEFAULT_RETRIEVAL_CONFIG
  const lines = [
    "CURRENT LEAN GOAL",
    input.formalStatement.trim(),
    "",
    input.goalProfile?.propositionHead ? `goal head: ${input.goalProfile.propositionHead}` : "",
    "",
    "RELEVANT PREMISES",
    "",
    "Use these when relevant.",
    "Do not assume they solve the goal.",
    "Do not invent theorem names.",
    "",
  ].filter((line, index, all) => !(line === "" && all[index - 1] === ""))
  input.premises.forEach((item, index) => {
    lines.push(`[${index + 1}]`)
    lines.push(`name: ${item.declaration.name}`)
    lines.push(`type: ${item.declaration.signature}`)
    lines.push(`origin: ${item.declaration.origin}${item.declaration.module ? ` / ${item.declaration.module}` : ""}`)
    if (item.declaration.unsafeForRelease) lines.push("flag: unsafe_for_release")
    lines.push("")
  })
  if (input.diagnostics) {
    lines.push("PREVIOUS LEAN DIAGNOSTICS")
    lines.push(input.diagnostics.slice(0, 1200))
    lines.push("")
  }
  let text = lines.join("\n")
  if (text.length > config.maxContextChars) text = `${text.slice(0, config.maxContextChars)}\n...`
  return text
}

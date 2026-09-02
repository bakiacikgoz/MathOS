import { CLAIM_KINDS, isClaimKind, type ClaimKind } from "@mathos/domain"

export interface SlashCommand {
  name: string
  description: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "formalize", description: "Draft a Lean statement and review fidelity" },
  { name: "formal", description: "Show the current formal counterpart" },
  { name: "prove", description: "Attempt a controlled Lean proof" },
  { name: "verify", description: "Re-run deterministic verification" },
  { name: "proof", description: "Show proof attempts and verification" },
  { name: "search-theorem", description: "Search local and Mathlib theorems" },
  { name: "premises", description: "Show ranked premises for a claim" },
  { name: "index", description: "Build or inspect the premise index" },
  { name: "research", description: "Start or step a research run" },
  { name: "team", description: "Start or step a multi-agent research session" },
  { name: "graph", description: "Show the research / proof graph" },
  { name: "experiment", description: "Experiments" },
  { name: "literature", description: "Literature" },
  { name: "context", description: "Mathematical context registry" },
  { name: "notebook", description: "Research notebook workflow" },
  { name: "align", description: "Formal/informal alignment workshop" },
  { name: "portfolio", description: "Proof portfolio cockpit" },
  { name: "failures", description: "Failure memory and changed-since" },
  { name: "ledger", description: "Epistemic ledger for a claim" },
  { name: "why", description: "Why verified / not verified" },
  { name: "history", description: "Session timeline" },
  { name: "blockers", description: "Review blockers" },
  { name: "progress", description: "Show current research run" },
  { name: "branch", description: "Create or switch a research branch" },
  { name: "branches", description: "List research branches" },
  { name: "claim", description: "Create a mathematical claim" },
  { name: "claims", description: "Browse research claims" },
  { name: "objective", description: "Set the main research objective" },
  { name: "status", description: "Show workspace research status" },
  { name: "doctor", description: "Check workspace and toolchain integrity" },
  { name: "help", description: "List available commands" },
  { name: "quit", description: "Leave the session" },
]

export function parseSlash(input: string): { name: string; rest: string } | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith("/")) return null
  const [raw, ...parts] = tokenize(trimmed.slice(1))
  const name = (raw ?? "").toLowerCase()
  if (!name) return null
  return { name, rest: parts.join(" ") }
}

export function suggestCommands(query: string): SlashCommand[] {
  const q = query.replace(/^\//, "").toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter((command) => command.name.startsWith(q) || command.name.includes(q))
}

export function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ""
  let quote: string | null = null
  for (const char of input) {
    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }
    if (char === "\"" || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current)
      current = ""
      continue
    }
    current += char
  }
  if (current) tokens.push(current)
  return tokens
}

export function parseClaimArgs(rest: string): { kind?: ClaimKind; title?: string } {
  const tokens = tokenize(rest)
  const result: { kind?: ClaimKind; title?: string } = {}
  if (tokens[0] && isClaimKind(tokens[0].toLowerCase())) {
    result.kind = tokens[0].toLowerCase() as ClaimKind
    if (tokens[1]) result.title = tokens.slice(1).join(" ")
  } else if (tokens[0]) {
    result.title = tokens.join(" ")
  }
  return result
}

export { CLAIM_KINDS }

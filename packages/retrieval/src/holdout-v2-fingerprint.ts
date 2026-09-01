import { createHash } from "node:crypto"

function targetOf(goal: string): string {
  return goal
    .replace(/^[\s\S]*?\btheorem\s+[A-Za-z0-9_'.]+\s*/u, "")
    .replace(/:=\s*by[\s\S]*$/u, "")
    .trim()
}

/**
 * Alpha-normalized, formatting-insensitive formal-goal fingerprint.
 * Binder names are replaced in declaration order while constants, type
 * constructors, operators and binder structure remain intact.
 */
export function normalizeFormalGoal(goal: string): string {
  let text = targetOf(goal).normalize("NFKC")
  const names: string[] = []
  const binder = /([({[])\s*([^\]}){]+?)\s*:\s*([^\]}){]+?)\s*([)}\]])/gu
  text = text.replace(binder, (_all, open: string, rawNames: string, type: string, close: string) => {
    const local = rawNames.trim().split(/\s+/u).filter((name) => /^[\p{L}_][\p{L}\p{N}_'₀-₉]*$/u.test(name))
    const canonical = local.map((name) => {
      let index = names.indexOf(name)
      if (index < 0) { names.push(name); index = names.length - 1 }
      return `v${index}`
    })
    return `${open}${canonical.join(" ")} : ${type.trim()}${close}`
  })
  names.forEach((name, index) => {
    text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}_'.])${escapeRegExp(name)}(?![\\p{L}\\p{N}_'])`, "gu"), `v${index}`)
  })
  return text
    .replace(/\b(?:inst|this|h|h₁|h₂|h₃|hp|hq|hr|hs|ht|hu|hv|hw)_[0-9]+\b/gu, "hyp")
    .replace(/\s+/gu, " ")
    .replace(/\s*([,:;(){}\[\]])\s*/gu, "$1")
    .trim()
}

export function formalGoalFingerprint(goal: string): string {
  return createHash("sha256").update(normalizeFormalGoal(goal)).digest("hex")
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

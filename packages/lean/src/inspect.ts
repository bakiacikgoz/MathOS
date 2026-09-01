export interface LeanGoalInspection {
  rawTarget: string
  conclusion: string | null
  propositionHead?: string
  constants: string[]
  namespaces: string[]
  typeConstructors: string[]
  operators: string[]
  localTypes: string[]
  conclusionTokens: string[]
  isEquality: boolean
  isIff: boolean
  isImplication: boolean
  isExistential: boolean
  isUniversal: boolean
  known: boolean
}

const TYPE_CTORS = new Set([
  "nat",
  "int",
  "rat",
  "real",
  "finset",
  "finsupp",
  "set",
  "list",
  "option",
  "prod",
  "sum",
  "subtype",
  "equiv",
  "fun",
  "prop",
  "bool",
  "string",
])

const STOP = new Set(["theorem", "lemma", "def", "axiom", "example", "where", "by", "sorry"])

export function splitConclusion(signature: string): { binders: string; conclusion: string | null } {
  const text = signature.replace(/\s+/g, " ").trim()
  let depth = 0
  let lastColon = -1
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === "(" || ch === "[" || ch === "{") depth += 1
    else if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1)
    else if (ch === ":" && depth === 0 && text[i + 1] === " ") lastColon = i
  }
  if (lastColon === -1) return { binders: text, conclusion: null }
  return { binders: text.slice(0, lastColon).trim(), conclusion: text.slice(lastColon + 1).trim() }
}

export function inspectLeanSignature(name: string, signature: string): LeanGoalInspection {
  const { binders, conclusion } = splitConclusion(signature)
  const target = conclusion ?? signature
  const tokens = identTokens(`${name} ${binders} ${target}`)
  const conclusionTokens = identTokens(target)
  const isEquality = /(?<![:])\s=\s/.test(` ${target} `) || /\bEq\b/.test(target)
  const isIff = /↔/.test(target) || /\bIff\b/.test(target)
  const isImplication = /(^| )→ /.test(target) || /\bImplies\b/.test(target)
  const isExistential = /∃/.test(target) || /\bExists\b/.test(target)
  const isUniversal = /∀/.test(target) || /\bForall\b/.test(binders + target)
  const operators: string[] = []
  if (/∪|union/i.test(target)) operators.push("union")
  if (/∩|inter/i.test(target)) operators.push("inter")
  if (/≤|LE/.test(target)) operators.push("le")
  if (/⊆|Subset/.test(target)) operators.push("subset")
  if (/card|#\s*\(|#s|#t|#A|#B/i.test(target)) operators.push("card")
  const typeConstructors = tokens.filter((token) => TYPE_CTORS.has(token))
  const namespaces = name.includes(".") ? [name.split(".")[0]!.toLowerCase()] : []
  const localTypes = identTokens(binders).filter((token) => TYPE_CTORS.has(token))
  let propositionHead: string | undefined
  if (isEquality) propositionHead = "Eq"
  else if (isIff) propositionHead = "Iff"
  else if (operators.includes("le")) propositionHead = "LE"
  else if (operators.includes("subset")) propositionHead = "Subset"
  else if (isExistential) propositionHead = "Exists"
  else if (/^True\b/.test(target)) propositionHead = "True"
  else if (conclusion) propositionHead = conclusionTokens[0]
  return {
    rawTarget: target,
    conclusion,
    propositionHead,
    constants: unique([...tokens.filter((token) => token.length > 2 && !STOP.has(token)), ...namespaces]),
    namespaces,
    typeConstructors: unique(typeConstructors),
    operators: unique(operators),
    localTypes: unique(localTypes),
    conclusionTokens,
    isEquality,
    isIff,
    isImplication,
    isExistential,
    isUniversal,
    known: conclusion !== null,
  }
}

export function inspectLeanSource(source: string): LeanGoalInspection {
  return inspectLeanSignature("goal", source)
}

function identTokens(text: string): string[] {
  return text
    .replace(/[∪∩≤≥⊆⊇↔→∀∃]/g, " ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP.has(token))
}

function unique(items: string[]): string[] {
  return [...new Set(items)]
}

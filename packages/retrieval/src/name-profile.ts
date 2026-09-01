import { tokenizeName } from "./normalize.ts"

export interface DeclarationNameProfile {
  fullName: string
  namespaceTokens: string[]
  nameTokens: string[]
  normalizedTokens: string[]
  suffixTokens: string[]
  prefixTokens: string[]
  tokenCount: number
}

export interface GoalNameProfile {
  primaryTokens: string[]
  structuralTokens: string[]
  operatorTokens: string[]
  typeTokens: string[]
}

export interface NameMatchResult {
  coverage: number
  ordered: boolean
  contiguous: number
  exactSuffix: boolean
  bigramHits: number
  trigramHits: number
  matchedTokens: string[]
}

const SEMANTIC_SUFFIXES = [
  "refl", "symm", "trans", "le", "lt", "eq", "ne", "ge", "gt",
  "mem", "not_mem", "subset", "union", "inter", "comm", "assoc",
  "intro", "elim", "apply", "some", "none", "neg", "nil", "empty",
  "append", "concat", "comp", "add", "sub", "mul", "div",
]

export function profileDeclarationName(name: string): DeclarationNameProfile {
  const tokens = tokenizeName(name)
  const nsPart = name.includes(".") ? name.split(".")[0]! : ""
  const nsTokens = tokenizeName(nsPart)
  const shortName = name.includes(".") ? name.split(".").at(-1)! : name
  const shortTokens = tokenizeName(shortName)
  const suffixTokens: string[] = []
  const prefixTokens: string[] = []
  for (const suffix of SEMANTIC_SUFFIXES) {
    if (shortTokens.at(-1) === suffix) suffixTokens.push(suffix)
    if (shortTokens[0] === suffix) prefixTokens.push(suffix)
  }
  return {
    fullName: name,
    namespaceTokens: nsTokens,
    nameTokens: shortTokens,
    normalizedTokens: tokens,
    suffixTokens,
    prefixTokens,
    tokenCount: tokens.length,
  }
}

export function profileGoalName(
  goalTokens: string[],
  operators: string[],
  typeConstructors: string[],
  propositionHead?: string,
): GoalNameProfile {
  const common = new Set(["nat", "int", "prop", "type", "sort", "true", "false"])
  const primary = goalTokens.filter((token) => !common.has(token))
  return {
    primaryTokens: primary,
    structuralTokens: propositionHead ? [propositionHead.toLowerCase()] : [],
    operatorTokens: operators,
    typeTokens: typeConstructors,
  }
}

export function matchGoalToDeclaration(goal: GoalNameProfile, decl: DeclarationNameProfile): NameMatchResult {
  const goalSet = new Set(goal.primaryTokens)
  const matched: string[] = []
  for (const token of decl.normalizedTokens) {
    if (goalSet.has(token)) matched.push(token)
  }
  const matchedSet = new Set(matched)
  const coverage = goal.primaryTokens.length > 0 ? matchedSet.size / goal.primaryTokens.length : 0

  let ordered = false
  if (matched.length >= 2) {
    let gi = 0
    let di = 0
    while (gi < goal.primaryTokens.length && di < decl.normalizedTokens.length) {
      if (goal.primaryTokens[gi] === decl.normalizedTokens[di]) {
        gi += 1
        di += 1
        if (gi === goal.primaryTokens.length) { ordered = true; break }
      } else {
        di += 1
      }
    }
  }

  const bigrams = makeNgrams(goal.primaryTokens, 2)
  const trigrams = makeNgrams(goal.primaryTokens, 3)
  const declBigrams = makeNgrams(decl.normalizedTokens, 2)
  const declTrigrams = makeNgrams(decl.normalizedTokens, 3)
  const bigramHits = countOverlap(bigrams, declBigrams)
  const trigramHits = countOverlap(trigrams, declTrigrams)
  const contiguous = bigramHits + trigramHits

  let exactSuffix = false
  for (const suffix of goal.operatorTokens) {
    if (decl.suffixTokens.includes(suffix)) { exactSuffix = true; break }
  }
  if (!exactSuffix && goal.structuralTokens.length) {
    for (const st of goal.structuralTokens) {
      if (decl.suffixTokens.includes(st) || decl.normalizedTokens.includes(st)) { exactSuffix = true; break }
    }
  }

  return { coverage, ordered, contiguous, exactSuffix, bigramHits, trigramHits, matchedTokens: matched }
}

export function bigramsOf(tokens: string[]): string[] {
  return makeNgrams(tokens, 2)
}

export function trigramsOf(tokens: string[]): string[] {
  return makeNgrams(tokens, 3)
}

function makeNgrams(tokens: string[], n: number): string[] {
  if (tokens.length < n) return []
  const out: string[] = []
  for (let i = 0; i <= tokens.length - n; i += 1) {
    out.push(tokens.slice(i, i + n).join("_"))
  }
  return out
}

function countOverlap(a: string[], b: string[]): number {
  const setB = new Set(b)
  let count = 0
  for (const item of a) {
    if (setB.has(item)) count += 1
  }
  return count
}

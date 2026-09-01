export const SEMANTIC_OPERATOR_PROFILE_VERSION = "SEMANTIC_OPERATOR_PROFILE_V1" as const

export type SemanticOperator = "add" | "sub" | "neg" | "mul" | "div" | "pow" | "inv" | "le" | "lt" | "ge" | "gt" | "union" | "inter" | "subset" | "mem" | "card" | "comp" | "relation_comp"
export type RelationProperty = "REFLEXIVE" | "SYMMETRIC" | "TRANSITIVE" | "ANTISYMMETRIC" | "IRREFLEXIVE" | "TOTAL" | "EQUIVALENCE"

export interface RelationProfile {
  hasComposition: boolean
  compositionCount: number
  property?: RelationProperty
}

export interface SemanticOperatorProfile {
  featureVersion: typeof SEMANTIC_OPERATOR_PROFILE_VERSION
  families: Array<"ARITHMETIC" | "ORDER" | "SET_COLLECTION" | "FUNCTION" | "RELATION">
  multiplicity: Partial<Record<SemanticOperator, number>>
  sequence: SemanticOperator[]
  morphologyTokens: string[]
  relation?: RelationProfile
}

const ORDERED: Array<{ symbol: string; operator: SemanticOperator; family: SemanticOperatorProfile["families"][number] }> = [
  { symbol: "∘r", operator: "relation_comp", family: "RELATION" },
  { symbol: "⁻¹", operator: "inv", family: "ARITHMETIC" },
  { symbol: "≥", operator: "ge", family: "ORDER" },
  { symbol: "≤", operator: "le", family: "ORDER" },
  { symbol: "⊆", operator: "subset", family: "SET_COLLECTION" },
  { symbol: "∪", operator: "union", family: "SET_COLLECTION" },
  { symbol: "∩", operator: "inter", family: "SET_COLLECTION" },
  { symbol: "∈", operator: "mem", family: "SET_COLLECTION" },
  { symbol: "∘", operator: "comp", family: "FUNCTION" },
  { symbol: "+", operator: "add", family: "ARITHMETIC" },
  { symbol: "*", operator: "mul", family: "ARITHMETIC" },
  { symbol: "/", operator: "div", family: "ARITHMETIC" },
  { symbol: "^", operator: "pow", family: "ARITHMETIC" },
  { symbol: "<", operator: "lt", family: "ORDER" },
  { symbol: ">", operator: "gt", family: "ORDER" },
  { symbol: "#", operator: "card", family: "SET_COLLECTION" },
]

export function extractSemanticOperatorProfile(formalGoal: string): SemanticOperatorProfile {
  const target = formalTarget(formalGoal)
  const matches: Array<{ index: number; operator: SemanticOperator; family: SemanticOperatorProfile["families"][number] }> = []
  for (let index = 0; index < target.length;) {
    const item = ORDERED.find((entry) => target.startsWith(entry.symbol, index))
    if (item) {
      matches.push({ index, operator: item.operator, family: item.family })
      index += item.symbol.length
      continue
    }
    if (target[index] === "-") {
      const previous = previousNonSpace(target, index)
      const unary = previous == null || "(,:=→".includes(previous)
      matches.push({ index, operator: unary ? "neg" : "sub", family: "ARITHMETIC" })
    }
    index += 1
  }
  matches.sort((a, b) => a.index - b.index)
  const sequence = matches.map((item) => item.operator)
  const multiplicity: Partial<Record<SemanticOperator, number>> = {}
  for (const operator of sequence) multiplicity[operator] = (multiplicity[operator] ?? 0) + 1
  const families = [...new Set(matches.map((item) => item.family))]
  const morphology = new Set<string>()
  for (const operator of sequence) if (["add", "sub", "neg", "mul", "div", "pow", "inv"].includes(operator)) morphology.add(operator)
  if (/(^|[^\p{L}\p{N}_])0([^\p{L}\p{N}_]|$)/u.test(target)) morphology.add("zero")
  if (/(^|[^\p{L}\p{N}_])1([^\p{L}\p{N}_]|$)/u.test(target)) morphology.add("one")
  if (/=/.test(target)) {
    for (const operator of ["add", "mul", "comp", "relation_comp"] as SemanticOperator[]) if ((multiplicity[operator] ?? 0) >= 3) morphology.add("assoc")
    if (isCommutativeShape(target)) morphology.add("comm")
    if (/\b([A-Za-z][\w']*)\s*-\s*\1\s*=\s*0\b/.test(target)) morphology.add("self")
  }
  const relationProperty = exactRelationProperty(target)
  const compositionCount = multiplicity.relation_comp ?? 0
  const relation = compositionCount > 0 || relationProperty ? { hasComposition: compositionCount > 0, compositionCount, ...(relationProperty ? { property: relationProperty } : {}) } : undefined
  return { featureVersion: SEMANTIC_OPERATOR_PROFILE_VERSION, families, multiplicity, sequence, morphologyTokens: [...morphology], ...(relation ? { relation } : {}) }
}

function formalTarget(goal: string) { const spaced = goal.lastIndexOf(" : "); const colon = spaced >= 0 ? spaced : goal.indexOf(":"); return (colon >= 0 ? goal.slice(colon + 1) : goal).trim() }
function previousNonSpace(value: string, index: number) { for (let at = index - 1; at >= 0; at -= 1) if (!/\s/.test(value[at]!)) return value[at]!; return null }
function isCommutativeShape(target: string) {
  const normalized = target.replace(/\s+/g, " ")
  for (const symbol of ["+", "*"]) {
    const escaped = symbol === "*" ? "\\*" : "\\+"
    const pattern = new RegExp(`\\b([A-Za-z][\\w']*)\\s*${escaped}\\s*([A-Za-z][\\w']*)\\s*=\\s*\\2\\s*${escaped}\\s*\\1\\b`)
    if (pattern.test(normalized)) return true
  }
  return false
}
function exactRelationProperty(target: string): RelationProperty | undefined {
  const rules: Array<[RegExp, RelationProperty]> = [[/\bReflexive\b/, "REFLEXIVE"], [/\bSymmetric\b/, "SYMMETRIC"], [/\bTransitive\b/, "TRANSITIVE"], [/\bAntisymmetric\b/, "ANTISYMMETRIC"], [/\bIrreflexive\b/, "IRREFLEXIVE"], [/\bTotal\b/, "TOTAL"], [/\b(?:Equivalence|Equivalence\.IsEquiv)\b/, "EQUIVALENCE"]]
  return rules.find(([pattern]) => pattern.test(target))?.[1]
}

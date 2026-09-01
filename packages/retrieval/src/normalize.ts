const SYMBOL_ALIASES: Record<string, string[]> = {
  "=": ["eq", "equality", "refl"],
  "≠": ["ne"],
  "≤": ["le"],
  "<": ["lt"],
  "≥": ["ge"],
  ">": ["gt"],
  "∈": ["mem"],
  "∉": ["not_mem"],
  "⊆": ["subset"],
  "⊂": ["subset"],
  "∪": ["union"],
  "∩": ["inter", "intersection"],
  "∅": ["empty"],
  "+": ["add"],
  "-": ["sub"],
  "*": ["mul"],
  "/": ["div"],
  "∘": ["comp"],
  "↔": ["iff"],
  "→": ["implies"],
  "¬": ["not"],
  "∃": ["exists"],
  "∀": ["forall"],
  "++": ["append", "concat"],
  "[]": ["nil", "empty"],
}

const TOKEN_ALIASES: Record<string, string[]> = {
  card: ["cardinality"],
  cardinality: ["card"],
  union: ["union"],
  le: ["le"],
  eq: ["eq", "refl"],
  mem: ["mem"],
  subset: ["subset"],
  comp: ["comp"],
  iff: ["iff"],
  exists: ["exists"],
  append: ["concat", "nil"],
}

const STOP = new Set(["theorem", "lemma", "def", "axiom", "example", "where", "by", "sorry", "for", "every", "the", "and", "that", "with", "from", "this", "prove", "show"])

export function tokenizeName(name: string): string[] {
  const dotted = name.replaceAll(".", " ")
  const snake = dotted.replaceAll("_", " ")
  const camel = snake.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
  const numeric = camel.replace(/([a-zA-Z])(\d)/g, "$1 $2").replace(/(\d)([a-zA-Z])/g, "$1 $2")
  return unique(
    numeric
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0 && !STOP.has(token)),
  )
}

export function expandSymbols(text: string): string[] {
  const found: string[] = []
  if (/#\s*\(|#\s*[A-Za-z]|#s|#t|#A|#B|\.card\b|card\b/i.test(text)) {
    found.push("card", "cardinality", "finset")
  }
  for (const [symbol, aliases] of Object.entries(SYMBOL_ALIASES)) {
    if (text.includes(symbol)) found.push(...aliases)
  }
  return unique(found)
}

export function expandTokenAliases(tokens: string[]): string[] {
  const out = [...tokens]
  for (const token of tokens) {
    const extra = TOKEN_ALIASES[token]
    if (extra) out.push(...extra)
  }
  return unique(out)
}

export function formalQueryTokens(goalText: string): string[] {
  const symbols = expandSymbols(goalText)
  const words = tokenizeName(goalText.replace(/[^\w.#=<>∪∩⊆⊂∈∉∅∘↔→¬∃∀≤≥≠+\-*/]+/g, " "))
  return expandTokenAliases(unique([...symbols, ...words])).filter((token) => !STOP.has(token))
}

export function namingPatterns(tokens: string[]): string[] {
  const patterns: string[] = []
  if (tokens.includes("le") || tokens.includes("lt")) patterns.push("_le", "le_")
  if (tokens.includes("eq") || tokens.includes("refl")) patterns.push("_eq", "eq_", "refl")
  if (tokens.includes("mem")) patterns.push("_mem", "mem_")
  if (tokens.includes("union")) patterns.push("_union", "union_")
  if (tokens.includes("subset")) patterns.push("_subset", "subset_")
  if (tokens.includes("iff")) patterns.push("_iff", "iff_")
  if (tokens.includes("exists")) patterns.push("exists")
  if (tokens.includes("comp")) patterns.push("_comp", "comp_")
  if (tokens.includes("add")) patterns.push("_add", "add_")
  if (tokens.includes("mul")) patterns.push("_mul", "mul_")
  if (tokens.includes("append")) patterns.push("append", "concat", "nil")
  return patterns
}

export function structureHeadFromGoal(text: string): string | undefined {
  if (/↔/.test(text) || /\bIff\b/.test(text)) return "Iff"
  if (/(?<![:])\s=\s/.test(` ${text} `) || /\bEq\b/.test(text)) return "Eq"
  if (/≤|≥|LE|GE/.test(text)) return "LE"
  if (/⊆|⊂|Subset/.test(text)) return "Subset"
  if (/∃|\bExists\b/.test(text)) return "Exists"
  if (/→/.test(text)) return "Implies"
  return undefined
}

function unique(items: string[]): string[] {
  return [...new Set(items)]
}

// Symbols for the math input: what the button shows, the LaTeX it writes in a statement, and the
// Unicode Lean expects. Lean abbreviations follow the Lean 4 editor input method (type \forall, get ∀).

export interface MathSymbol { show: string; latex: string; lean?: string; names: string[] }
export interface SymbolGroup { id: "common" | "relations" | "logic" | "sets" | "operators" | "greek" | "arrows"; items: MathSymbol[] }

const s = (show: string, latex: string, lean: string | undefined, ...names: string[]): MathSymbol => ({ show, latex, lean, names })

export const SYMBOL_GROUPS: SymbolGroup[] = [
  { id: "relations", items: [
    s("≤", "\\le", "≤", "le", "leq"), s("≥", "\\ge", "≥", "ge", "geq"), s("≠", "\\neq", "≠", "ne", "neq"), s("≈", "\\approx", "≈", "approx"),
    s("≡", "\\equiv", "≡", "equiv"), s("∼", "\\sim", "∼", "sim"), s("∣", "\\mid", "∣", "mid", "dvd"), s("∝", "\\propto", undefined, "propto"),
    s("<", "<", "<", "lt"), s(">", ">", ">", "gt"), s("≪", "\\ll", "≪", "ll"), s("≫", "\\gg", "≫", "gg"),
  ] },
  { id: "logic", items: [
    s("∀", "\\forall", "∀", "forall", "all"), s("∃", "\\exists", "∃", "exists", "ex"), s("¬", "\\neg", "¬", "neg", "not"), s("∧", "\\land", "∧", "and", "land", "wedge"),
    s("∨", "\\lor", "∨", "or", "lor", "vee"), s("⇒", "\\implies", "→", "implies", "imp", "=>"), s("⇔", "\\iff", "↔", "iff", "lr"), s("⊤", "\\top", "⊤", "top"), s("⊥", "\\bot", "⊥", "bot"),
  ] },
  { id: "sets", items: [
    s("ℕ", "\\mathbb{N}", "ℕ", "N", "nat"), s("ℤ", "\\mathbb{Z}", "ℤ", "Z", "int"), s("ℚ", "\\mathbb{Q}", "ℚ", "Q", "rat"), s("ℝ", "\\mathbb{R}", "ℝ", "R", "real"),
    s("ℂ", "\\mathbb{C}", "ℂ", "C", "complex"), s("∈", "\\in", "∈", "in", "mem"), s("∉", "\\notin", "∉", "notin", "nin"), s("⊆", "\\subseteq", "⊆", "subseteq", "sub"),
    s("⊂", "\\subset", "⊂", "subset", "ssub"), s("∪", "\\cup", "∪", "cup", "union"), s("∩", "\\cap", "∩", "cap", "inter"), s("∅", "\\emptyset", "∅", "emptyset", "empty"),
    s("×", "\\times", "×", "times", "x", "prod-type"), s("∖", "\\setminus", "\\", "setminus", "diff"),
  ] },
  { id: "operators", items: [
    s("∑", "\\sum", "∑", "sum"), s("∏", "\\prod", "∏", "prod"), s("∫", "\\int", "∫", "int", "integral"), s("√", "\\sqrt{‸}", "√", "sqrt"),
    s("∞", "\\infty", "∞", "infty", "inf"), s("∂", "\\partial", "∂", "partial"), s("±", "\\pm", "±", "pm"), s("·", "\\cdot", "·", "cdot", "."),
    s("÷", "\\div", "÷", "div"), s("∘", "\\circ", "∘", "circ", "comp"), s("⌊⌋", "\\lfloor ‸ \\rfloor", "⌊", "floor", "lfloor"), s("⌈⌉", "\\lceil ‸ \\rceil", "⌈", "ceil", "lceil"),
    s("|x|", "\\lvert ‸ \\rvert", "|‸|", "abs"), s("n!", "!", "!", "factorial"), s("⁻¹", "^{-1}", "⁻¹", "inv", "^-1"),
  ] },
  { id: "arrows", items: [
    s("→", "\\to", "→", "to", "r", "->"), s("←", "\\leftarrow", "←", "leftarrow", "l", "<-"), s("↔", "\\leftrightarrow", "↔", "leftrightarrow", "<->"), s("↦", "\\mapsto", "↦", "mapsto"),
    s("⟨", "\\langle", "⟨", "langle", "<"), s("⟩", "\\rangle", "⟩", "rangle", ">"),
  ] },
  { id: "greek", items: [
    s("α", "\\alpha", "α", "alpha", "a"), s("β", "\\beta", "β", "beta", "b"), s("γ", "\\gamma", "γ", "gamma", "g"), s("δ", "\\delta", "δ", "delta", "d"),
    s("ε", "\\varepsilon", "ε", "epsilon", "e"), s("ζ", "\\zeta", "ζ", "zeta"), s("η", "\\eta", "η", "eta"), s("θ", "\\theta", "θ", "theta", "th"),
    s("κ", "\\kappa", "κ", "kappa"), s("λ", "\\lambda", "λ", "lambda", "fun", "lam"), s("μ", "\\mu", "μ", "mu"), s("ν", "\\nu", "ν", "nu"),
    s("ξ", "\\xi", "ξ", "xi"), s("π", "\\pi", "π", "pi"), s("ρ", "\\rho", "ρ", "rho"), s("σ", "\\sigma", "σ", "sigma"),
    s("τ", "\\tau", "τ", "tau"), s("φ", "\\varphi", "φ", "phi"), s("χ", "\\chi", "χ", "chi"), s("ψ", "\\psi", "ψ", "psi"),
    s("ω", "\\omega", "ω", "omega"), s("Γ", "\\Gamma", "Γ", "Gamma"), s("Δ", "\\Delta", "Δ", "Delta"), s("Θ", "\\Theta", "Θ", "Theta"),
    s("Λ", "\\Lambda", "Λ", "Lambda"), s("Σ", "\\Sigma", "Σ", "Sigma"), s("Φ", "\\Phi", "Φ", "Phi"), s("Ω", "\\Omega", "Ω", "Omega"),
  ] },
]

/** Structures that need a place to type into; `‸` marks where the cursor lands. */
export interface MathTemplate { id: string; show: string; latex: string; lean?: string }
export const TEMPLATES: MathTemplate[] = [
  { id: "frac", show: "a⁄b", latex: "\\frac{‸}{}", lean: "(‸) / ()" },
  { id: "pow", show: "xⁿ", latex: "^{‸}", lean: "^‸" },
  { id: "sub", show: "xᵢ", latex: "_{‸}", lean: "‸" },
  { id: "sqrt", show: "√x", latex: "\\sqrt{‸}", lean: "Real.sqrt ‸" },
  { id: "sum", show: "∑ⁿ", latex: "\\sum_{i=1}^{n} ‸", lean: "∑ i ∈ Finset.range n, ‸" },
  { id: "int", show: "∫ᵇₐ", latex: "\\int_{a}^{b} ‸ \\, dx", lean: "∫ x in a..b, ‸" },
  { id: "binom", show: "(ⁿₖ)", latex: "\\binom{‸}{}", lean: "Nat.choose ‸ " },
  { id: "abs", show: "|x|", latex: "\\lvert ‸ \\rvert", lean: "|‸|" },
]

/** The toolbar's short list; the rest is one click away in the full palette. */
export const QUICK = ["≤", "≥", "≠", "∈", "∀", "∃", "⇒", "∞", "ℕ", "ℝ", "π"]

const CARET = "‸"
const ALL = SYMBOL_GROUPS.flatMap((group) => group.items)

/** Suggestions for what follows a backslash, best matches first. */
export function completions(prefix: string, mode: "latex" | "lean", limit = 8): MathSymbol[] {
  const needle = prefix.toLowerCase()
  if (!needle) return []
  const scored = ALL
    .filter((item) => mode === "latex" || item.lean)
    .map((item) => {
      const names = [...item.names, item.latex.replace(/^\\/, "").replace(/\{.*$/, "")]
      const exact = names.some((name) => name === prefix), starts = names.some((name) => name.toLowerCase().startsWith(needle))
      return { item, rank: exact ? 0 : starts ? 1 : names.some((name) => name.toLowerCase().includes(needle)) ? 2 : 9 }
    })
    .filter((row) => row.rank < 9)
    .sort((a, b) => a.rank - b.rank)
  return [...new Set(scored.map((row) => row.item))].slice(0, limit)
}

/** Lean input method: the exact abbreviation (case-sensitive, as in Lean: \N is ℕ) or null. */
export function leanAbbreviation(name: string): string | null {
  for (const item of ALL) if (item.lean && item.names.includes(name)) return item.lean
  const sub = /^_(\d)$/.exec(name); if (sub) return String.fromCharCode(0x2080 + Number(sub[1]))
  return null
}

/** True when `offset` is inside $…$ or \(…\) in `text`, so a symbol can be written without new dollars. */
export function insideMath(text: string, offset: number): boolean {
  const before = text.slice(0, offset)
  const dollars = (before.replace(/\\\$/g, "").match(/\$/g) ?? []).length
  const opens = (before.match(/\\\(/g) ?? []).length, closes = (before.match(/\\\)/g) ?? []).length
  return dollars % 2 === 1 || opens > closes
}

/** Text to insert for a symbol or template at `offset`: LaTeX wrapped in $…$ when outside math; `caret` is where the cursor goes. */
export function insertion(text: string, offset: number, latex: string, mode: "latex" | "lean", lean?: string): { insert: string; caret: number } {
  const raw = mode === "lean" ? (lean ?? latex) : latex
  const wrap = mode === "latex" && !insideMath(text, offset)
  const body = raw.includes(CARET) ? raw : `${raw}${mode === "latex" && /\\[a-zA-Z]+$/.test(raw) ? " " : ""}${CARET}`
  const full = wrap ? `$${body}$` : body
  const caret = full.indexOf(CARET)
  return { insert: full.replace(CARET, ""), caret }
}

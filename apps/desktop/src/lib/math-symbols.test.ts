import { describe, expect, test } from "bun:test"
import { completions, insertion, insideMath, leanAbbreviation, searchMath, splitMath, toMathfieldInsert } from "./math-symbols.ts"

describe("math input helpers", () => {
  test("detects whether the cursor is inside $…$ or \\(…\\)", () => {
    expect(insideMath("a $x", 4)).toBe(true)
    expect(insideMath("a $x$ b", 7)).toBe(false)
    expect(insideMath("cost \\$5 and $y", 15)).toBe(true)
    expect(insideMath("\\(x", 3)).toBe(true)
  })

  test("symbols outside math are wrapped in dollars; templates put the cursor in the first slot", () => {
    expect(insertion("for ", 4, "\\le", "latex")).toEqual({ insert: "$\\le $", caret: 5 })
    expect(insertion("$x", 2, "\\le", "latex")).toEqual({ insert: "\\le ", caret: 4 })
    expect(insertion("$", 1, "\\frac{‸}{}", "latex")).toEqual({ insert: "\\frac{}{}", caret: 6 })
    expect(insertion("", 0, "\\le", "lean", "≤")).toEqual({ insert: "≤", caret: 1 })
  })

  test("backslash completions rank exact and prefix matches first; Lean mode lists only Lean symbols", () => {
    expect(completions("alp", "latex")[0]?.show).toBe("α")
    expect(completions("fora", "lean")[0]?.show).toBe("∀")
    expect(completions("propto", "lean")).toHaveLength(0)
    expect(completions("", "latex")).toHaveLength(0)
  })

  test("Lean abbreviations follow the editor input method", () => {
    expect(leanAbbreviation("forall")).toBe("∀")
    expect(leanAbbreviation("N")).toBe("ℕ")
    expect(leanAbbreviation("to")).toBe("→")
    expect(leanAbbreviation("_2")).toBe("₂")
    expect(leanAbbreviation("nosuch")).toBeNull()
  })
})

describe("math composer helpers", () => {
  test("statements split into text and formulas, keeping escaped dollars as text", () => {
    expect(splitMath("Her $n$ için $$n^2$$ ve \\(x\\) ile 5\\$")).toEqual([
      { kind: "text", value: "Her " }, { kind: "math", value: "n" }, { kind: "text", value: " için " }, { kind: "math", value: "n^2" },
      { kind: "text", value: " ve " }, { kind: "math", value: "x" }, { kind: "text", value: " ile 5\\$" },
    ])
    expect(splitMath("no math")).toEqual([{ kind: "text", value: "no math" }])
  })

  test("symbols are found by everyday Turkish or English words, accents ignored", () => {
    expect(searchMath("toplam")[0]?.latex).toContain("\\sum")
    expect(searchMath("alt kume").map((hit) => hit.latex)).toContain("\\subseteq")
    expect(searchMath("subset").map((hit) => hit.latex)).toContain("\\subseteq")
    expect(searchMath("integral")[0]?.template).toBe(true)
    expect(searchMath("reel")[0]?.latex).toBe("\\mathbb{R}")
    expect(searchMath("")).toEqual([])
  })

  test("templates become MathLive placeholders", () => {
    expect(toMathfieldInsert("\\frac{‸}{}")).toBe("\\frac{#?}{#?}")
    expect(toMathfieldInsert("\\sum_{i=1}^{n} ‸")).toBe("\\sum_{i=1}^{n} #?")
  })
})

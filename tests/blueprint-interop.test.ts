import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { exportBlueprintLatex, importBlueprintLatex, parseMathosMarkdown } from "@mathos/notebook"

const source = readFileSync(join(import.meta.dir, "fixtures/blueprint/sample.tex"), "utf8")

describe("Lean Blueprint interoperability", () => {
  test("imports sections, theorem/definition metadata and preserves unknown macros", () => {
    const result = importBlueprintLatex(source, { declarationExists:(name) => name === "MathOS.key" })
    expect(result.markdown).toContain("# Foundations")
    expect(result.markdown).toContain(':::claim-ref id="thm:main"')
    expect(result.declarations.map((item) => item.name)).toEqual(["MathOS.key","MathOS.main"])
    expect(result.unresolvedDeclarations).toEqual(["MathOS.main"])
    expect(result.lossReport).toEqual([expect.objectContaining({ kind:"UNKNOWN_MACRO", raw:"\\mysterymacro{preserve me}" })])
    expect(result.markdown).toContain("\\mysterymacro{preserve me}")
  })

  test("exports MathOS directives as blueprint-compatible LaTeX", () => {
    const document = parseMathosMarkdown('# Results\n\n:::claim-ref id="C-001"\nMain theorem.\n:::\n\n:::proof-sketch claim="C-001" id="NB-PS-1"\nProof.\n:::\n')
    const latex = exportBlueprintLatex(document)
    expect(latex).toContain("\\section{Results}")
    expect(latex).toContain("\\begin{theorem}")
    expect(latex).toContain("\\label{C-001}")
    expect(latex).toContain("\\uses{C-001}")
  })
})

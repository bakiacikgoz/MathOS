import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseMathosMarkdown, renderMathosMarkdown, referencedEntities } from "@mathos/notebook"

const fixture = readFileSync(join(import.meta.dir, "fixtures/notebook/research.mathos.md"), "utf8")

describe("MathOS Markdown", () => {
  test("round-trips whitespace, Unicode, headings, known and unknown directives", () => {
    const document = parseMathosMarkdown(fixture)
    expect(renderMathosMarkdown(document)).toBe(fixture)
    expect(document.blocks.find((block) => block.directive === "future-widget")?.known).toBe(false)
    expect(document.blocks.every((block) => block.range.startLine <= block.range.endLine)).toBe(true)
    expect(referencedEntities(document)).toEqual([{ type:"claim", id:"C-001" }])
  })

  test("rejects duplicate IDs, unclosed and oversized directives", () => {
    expect(() => parseMathosMarkdown(':::proof-sketch id="X" claim="C-001"\na\n:::\n:::proof-sketch id="X" claim="C-001"\nb\n:::\n')).toThrow("DUPLICATE_DIRECTIVE_ID")
    expect(() => parseMathosMarkdown(':::claim-ref id="C-001"\n')).toThrow("UNCLOSED_DIRECTIVE")
    expect(() => parseMathosMarkdown(`:::proof-sketch id="X" claim="C-001"\n${"a".repeat(1_000_001)}\n:::\n`)).toThrow("DIRECTIVE_TOO_LARGE")
  })

  test("rejects malicious paths and invalid entity identifiers", () => {
    expect(() => parseMathosMarkdown(':::future path="../../secret"\nx\n:::\n')).toThrow("UNSAFE_DIRECTIVE_PATH")
    expect(() => parseMathosMarkdown(':::claim-ref id="not-a-claim"\nx\n:::\n')).toThrow("INVALID_ENTITY_ID")
  })
})

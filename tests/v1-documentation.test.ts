import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const required = [
  "PROFESSIONAL_PILOT.md", "NOTEBOOK_FORMAT_V1.md", "ALIGNMENT_WORKFLOW.md",
  "PROVER_ADAPTER_CONTRACT.md", "SOLVER_TRUST_MODEL.md", "LITERATURE_INGESTION.md",
  "ATLAS_GUIDE.md", "VSCODE_BRIDGE.md", "REVIEW_AND_SEMANTIC_MERGE.md",
  "CAPSULE_FORMAT_V1.md", "PUBLICATION_GUIDE.md", "SECURITY_MODEL_V1.md",
]
const text = (path:string) => readFileSync(resolve(root, path), "utf8")

describe("MathOS v1 documentation closure", () => {
  test("ships every professional guide and keeps local markdown links navigable", () => {
    for (const file of required) expect(existsSync(resolve(root, "docs", file))).toBe(true)
    for (const source of ["README.md", "docs/PILOT.md", ...required.map(file => `docs/${file}`)]) {
      for (const match of text(source).matchAll(/\[[^\]]+\]\((?!https?:|#)([^)]+\.md)(?:#[^)]+)?\)/gu)) {
        expect(existsSync(resolve(resolve(root, source), "..", match[1]!))).toBe(true)
      }
    }
  })

  test("documents runnable quickstart, pilot feedback, and trust boundaries", () => {
    const pilot = text("docs/PROFESSIONAL_PILOT.md")
    for (const command of ["bun install --frozen-lockfile", "mathos init", "mathos doctor", "mathos capsule", "mathos publish"]) expect(pilot).toContain(command)
    for (const field of ["Confusion", "Trust", "Time saved", "Failure", "False confidence", "Missing workflow"]) expect(pilot).toContain(field)
    const readme = text("README.md")
    expect(readme).toContain("VerificationGate")
    expect(readme).toContain("not an automatic solver of open problems")
    expect(readme).not.toMatch(/automatically solves open problems|LLM output is (?:a )?proof/iu)
  })

  test("states authority and fail-closed security consistently", () => {
    const corpus = required.map(file => text(`docs/${file}`)).join("\n")
    expect(corpus).toContain("KERNEL_VERIFIED")
    expect(corpus).toContain("VerificationGate")
    expect(corpus).toContain("fail-closed")
    expect(corpus).toContain("not proof")
  })
})

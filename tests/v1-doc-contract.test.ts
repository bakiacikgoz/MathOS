import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const documents = [
  "docs/PRODUCT_BOUNDARY_V1.md",
  "docs/TRUST_MODEL_V1.md",
  "docs/adr/ADR-001-research-os-adapter-architecture.md",
  "docs/adr/ADR-002-tui-atlas-vscode-surfaces.md",
  "docs/adr/ADR-003-lean-verification-authority.md",
  "docs/adr/ADR-004-out-of-process-plugin-model.md",
]

describe("MathOS v1 documentation contract", () => {
  test("required product and trust documents exist with navigable links", () => {
    for (const path of documents) expect(existsSync(resolve(root, path))).toBe(true)
    const boundary = readFileSync(resolve(root, documents[0]!), "utf8")
    expect(boundary).toContain("## In scope")
    expect(boundary).toContain("## Out of scope")
    expect(boundary).toContain("[Trust model](TRUST_MODEL_V1.md)")
    expect(boundary).toContain("[ADR-001](adr/ADR-001-research-os-adapter-architecture.md)")
  })

  test("states the VerificationGate authority and rejects forbidden product claims", () => {
    const corpus = documents.map((path) => readFileSync(resolve(root, path), "utf8")).join("\n")
    expect(corpus).toContain("KERNEL_VERIFIED yalnız VerificationGate")
    expect(corpus).toContain("LLM output is not proof")
    expect(corpus).not.toMatch(/MathOS (?:her|tüm) matematik problemlerini otomatik çözer/i)
    expect(corpus).not.toMatch(/LLM çıktısı matematiksel kanıttır/i)
  })

  test("records adapter, UI, and plugin authority boundaries", () => {
    const corpus = documents.map((path) => readFileSync(resolve(root, path), "utf8")).join("\n")
    expect(corpus).toContain("read-only")
    expect(corpus).toContain("JSON-RPC 2.0 stdio")
    expect(corpus).toContain("fail-closed")
    expect(corpus).toContain("target-side re-verification")
  })
})

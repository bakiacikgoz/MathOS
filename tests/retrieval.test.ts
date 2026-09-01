import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"
import {
  extractUnknownIdentifiers,
  InMemoryPremiseRetriever,
  parseLeanDeclarations,
  rankDeclarations,
  writeIndex,
} from "@mathos/retrieval"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter } from "@mathos/lean"

const temps: string[] = []
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "mathos-ret-"))
  temps.push(dir)
  return dir
}
afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

const decls = [
  { name: "Finset.card_union_le", kind: "theorem" as const, signature: "theorem Finset.card_union_le (s t : Finset α) : (s ∪ t).card ≤ s.card + t.card", module: "Mathlib.Data.Finset.Card", origin: "mathlib" as const },
  { name: "Finset.card_union_of_disjoint", kind: "theorem" as const, signature: "theorem Finset.card_union_of_disjoint ...", module: "Mathlib.Data.Finset.Card", origin: "mathlib" as const },
  { name: "Nat.add_le_add", kind: "theorem" as const, signature: "theorem Nat.add_le_add ...", module: "Mathlib.Data.Nat.Order", origin: "mathlib" as const },
  { name: "mathos_l18", kind: "lemma" as const, signature: "theorem mathos_l18 : True", origin: "workspace" as const, claimId: "L-018", claimStatus: "KERNEL_VERIFIED" },
  { name: "mathos_unverified", kind: "lemma" as const, signature: "theorem mathos_unverified : True", origin: "workspace" as const, claimId: "L-002", claimStatus: "FORMALIZED_UNVERIFIED" },
  { name: "mathos_stale", kind: "lemma" as const, signature: "theorem mathos_stale : True", origin: "workspace" as const, claimId: "L-003", claimStatus: "STALE" },
  { name: "mathos_disproved", kind: "lemma" as const, signature: "theorem mathos_disproved : False", origin: "workspace" as const, claimId: "L-004", claimStatus: "DISPROVED" },
]

describe("retrieval", () => {
  test("parses local declarations", () => {
    const parsed = parseLeanDeclarations(
      "namespace Foo\ntheorem bar (n : Nat) : n = n\nend Foo\n",
      { origin: "workspace", module: "MathosFormal.Smoke" },
    )
    expect(parsed[0]?.name).toBe("Foo.bar")
    expect(parsed[0]?.kind).toBe("theorem")
  })

  test("exact match and signature overlap rank", () => {
    const ranked = rankDeclarations(decls, { query: "finite union cardinality card Finset", maxPremises: 10 })
    expect(ranked[0]?.declaration.name).toContain("card_union")
    expect(ranked[0]?.reasons.some((reason) => reason.includes("signature") || reason.includes("token"))).toBe(true)
  })

  test("local verified boost and exclusions", () => {
    const ranked = rankDeclarations(decls, {
      query: "True",
      dependencyNames: ["L-018"],
      allowedLocalStatuses: ["KERNEL_VERIFIED"],
      maxPremises: 20,
    })
    const names = ranked.map((item) => item.declaration.name)
    expect(names).toContain("mathos_l18")
    expect(names).not.toContain("mathos_unverified")
    expect(names).not.toContain("mathos_stale")
    expect(names).not.toContain("mathos_disproved")
    const local = ranked.find((item) => item.declaration.name === "mathos_l18")
    expect(local?.reasons.some((reason) => reason.includes("KERNEL_VERIFIED") || reason.includes("dependency"))).toBe(true)
  })

  test("context max premise cap", () => {
    const ranked = rankDeclarations(decls, { query: "card union add", maxPremises: 2 })
    expect(ranked.length).toBeLessThanOrEqual(2)
  })

  test("unknown identifier enriches retry", async () => {
    expect(extractUnknownIdentifiers("unknown identifier 'Finset.card_union_le'")).toEqual(["Finset.card_union_le"])
    const retriever = new InMemoryPremiseRetriever(decls)
    await retriever.retrieve({ query: "goal", unknownIdentifiers: ["Finset.card_union_le"] })
    expect(retriever.lastRequest?.unknownIdentifiers).toContain("Finset.card_union_le")
    const ranked = rankDeclarations(decls, { query: "goal", unknownIdentifiers: ["Finset.card_union_le"] })
    expect(ranked[0]?.declaration.name).toBe("Finset.card_union_le")
  })

  test("index persistence and stale detection", async () => {
    const created = await MathOS.init(tempDir(), "idx")
    writeIndex(created.root, {
      revision: "old",
      leanVersion: "x",
      mathlibRevision: "y",
      formalFingerprint: "a",
      verifiedFingerprint: "b",
      builtAt: new Date().toISOString(),
      declarationCount: 1,
      mathlibCount: 0,
      workspaceCount: 1,
    }, decls)
    const app = MathOS.open(created.root, { leanAdapter: new FakeLeanAdapter(), modelProvider: new FakeModelProvider() })
    try {
      const status = app.indexStatus()
      expect(status.present).toBe(true)
      expect(status.stale).toBe(true)
    } finally {
      app.close()
    }
  })

  test("proof receives retrieved context and keeps 3-attempt cap", async () => {
    const created = await MathOS.init(tempDir(), "ctx")
    const model = new FakeModelProvider()
    model.enqueue({
      declarationName: "id_nat",
      leanStatement: "theorem id_nat (n : Nat) : n = n",
      variableMapping: [],
      assumptionMapping: [],
      uncertainties: [],
    })
    model.enqueue({
      verdict: "MATCH",
      findings: [],
      naturalSummary: "n = n",
      formalBackTranslation: "n = n",
    })
    model.enqueue({ proofBody: "by\n  sorry" })
    model.enqueue({ proofBody: "by\n  sorry" })
    model.enqueue({ proofBody: "by\n  sorry" })
    const retriever = new InMemoryPremiseRetriever(decls)
    const app = MathOS.open(created.root, {
      modelProvider: model,
      auditorProvider: model,
      leanAdapter: new FakeLeanAdapter(),
      premiseRetriever: retriever,
    })
    try {
      app.createClaim({ kind: "conjecture", title: "Identity", statement: "n = n" })
      const session = await app.formalize("C-001")
      app.approveFormal(session.formalStatement.id)
      const proved = await app.prove("C-001")
      expect(proved.attempts.length).toBe(3)
      expect(retriever.retrieveCalls).toBe(3)
      expect(proved.attempts[0]?.candidateNames.length).toBeGreaterThan(0)
      expect(app.getClaim("C-001").status).toBe("FORMALIZED_UNVERIFIED")
    } finally {
      app.close()
    }
  })
})

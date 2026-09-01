import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, FakeResearchPlanner } from "@mathos/core"
import { FakeVcs } from "@mathos/vcs"
import { isPublicHttpUrl } from "@mathos/literature"

const dirs: string[] = []
function temp() {
  const dir = mkdtempSync(join(tmpdir(), "mathos-lit-"))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function boot() {
  const created = await MathOS.init(temp(), "lit")
  const app = MathOS.open(created.root, { vcs: new FakeVcs() })
  const claim = app.createClaim({ kind: "conjecture", title: "T", statement: "Every contraction on a complete metric space has a unique fixed point.", asMainObjective: true })
  return { app, claim }
}

describe("literature provenance", () => {
  test("search import excerpt citation does not verify", async () => {
    const { app, claim } = await boot()
    const search = await app.searchLiterature("fixed point contraction")
    expect(search.resultCount).toBeGreaterThan(0)
    const source = await app.importSearchResult(search.id, 0)
    const again = await app.importSearchResult(search.id, 0)
    expect(again.id).toBe(source.id)
    app.inspectSource(source.id)
    const excerpt = app.addExcerpt(source.id, "A contraction mapping on a complete metric space has a unique fixed point.", { kind: "THEOREM", theorem: "1.2" })
    const ext = app.extractExternalResult({ sourceId: source.id, excerptId: excerpt.id, name: "Banach fixed-point theorem", statementSummary: "A contraction mapping on a complete metric space has a unique fixed point.", locator: { kind: "THEOREM", theorem: "1.2" } })
    const citation = app.cite({ sourceId: source.id, claimId: claim.id, purpose: "SUPPORT", locator: { kind: "THEOREM", theorem: "1.2" }, externalResultId: ext.id, excerptId: excerpt.id })
    expect(citation.locator?.kind).toBe("THEOREM")
    expect(app.getClaim(claim.id).status).not.toBe("KERNEL_VERIFIED")
    expect(app.getClaim(claim.id).status).not.toBe("EXTERNAL_KNOWN")
    const graph = app.buildGraph({ includeLiterature: true })
    expect(graph.nodes.some((node) => node.id === source.id && node.kind === "SOURCE")).toBe(true)
    expect(graph.edges.some((edge) => edge.kind === "EXTRACTED_FROM" && edge.fromNodeId === ext.id)).toBe(true)
    expect(app.researchContext().text).toContain("NOT KERNEL VERIFIED")
    app.close()
  })

  test("external known requires review and is not kernel verified", async () => {
    const { app, claim } = await boot()
    const source = app.importSource({ title: "Notes", authors: ["A"], doi: "10.1000/fake-doi" })
    const excerpt = app.addExcerpt(source.id, "Theorem 3.2 uniqueness of primes.")
    const ext = app.extractExternalResult({ sourceId: source.id, excerptId: excerpt.id, statementSummary: "Theorem 3.2 uniqueness of primes.", statementMode: "QUOTED_EXCERPT" })
    expect(() => app.linkExternalKnown(claim.id, ext.id)).toThrow("EXTERNAL_KNOWN_REQUIRES_REVIEW")
    app.reviewExternalResult(ext.id)
    const linked = app.linkExternalKnown(claim.id, ext.id)
    expect(linked.status).toBe("EXTERNAL_KNOWN")
    expect(linked.status).not.toBe("KERNEL_VERIFIED")
    app.close()
  })

  test("unsupported extraction and locator mismatch", async () => {
    const { app } = await boot()
    const source = app.importSource({ title: "Paper", authors: ["B"], url: "https://example.invalid/p" })
    expect(() => app.extractExternalResult({ sourceId: source.id, statementSummary: "invented theorem" })).toThrow("UNSUPPORTED_EXTRACTION")
    const excerpt = app.addExcerpt(source.id, "compactness of closed bounded sets", { kind: "PAGE", pageStart: 12 })
    expect(() => app.extractExternalResult({ sourceId: source.id, excerptId: excerpt.id, statementSummary: "totally unrelated invented result", locator: { kind: "THEOREM", theorem: "9" } })).toThrow()
    app.close()
  })

  test("branch citation isolation and search repetition", async () => {
    const { app, claim } = await boot()
    await app.searchLiterature("fixed point")
    await expect(app.searchLiterature("fixed point")).rejects.toThrow("LITERATURE_SEARCH_REPETITION")
    const source = app.importSource({ title: "Shared", authors: ["C"], isbn: "978-1-4020-0000-0" })
    const excerpt = app.addExcerpt(source.id, "lemma on completeness")
    const child = await app.createBranch("lit-side")
    app.switchBranch(child.id)
    const ext = app.extractExternalResult({ sourceId: source.id, excerptId: excerpt.id, statementSummary: "lemma on completeness", statementMode: "SUMMARY" })
    app.cite({ sourceId: source.id, claimId: claim.id, purpose: "BACKGROUND", externalResultId: ext.id, excerptId: excerpt.id })
    app.switchBranch("B-000")
    expect(app.listCitations("B-000").length).toBe(0)
    expect(app.listCitations(child.id).length).toBe(1)
    expect(app.listExternal("B-000").some((item) => item.id === ext.id)).toBe(false)
    expect(app.listSources().some((item) => item.id === source.id)).toBe(true)
    app.close()
  })

  test("local document fingerprint and research action", async () => {
    expect(isPublicHttpUrl("http://127.0.0.1/x")).toBe(false)
    expect(isPublicHttpUrl("file:///etc/passwd")).toBe(false)
    const { app, claim } = await boot()
    const file = join(temp(), "note.txt")
    writeFileSync(file, "Theorem 4.1: unique factorization into primes.")
    const source = app.addLocalSource(file, { title: "Local notes" })
    expect(source.fingerprint.startsWith("file:")).toBe(true)
    const planner = new FakeResearchPlanner([
      { action: "SEARCH_LITERATURE", rationaleSummary: "find known theorem", parameters: { query: "fundamental theorem" }, researchDecisionVersion: "v1" },
      { action: "STOP", rationaleSummary: "done", parameters: {}, researchDecisionVersion: "v1", stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } },
    ])
    const created = await MathOS.init(temp(), "loop")
    const loop = MathOS.open(created.root, { vcs: new FakeVcs(), researchPlanner: planner })
    const objective = loop.createClaim({ kind: "conjecture", title: "Obj", statement: "FTA", asMainObjective: true })
    const run = loop.startResearch()
    await loop.runResearch(run.id)
    expect(loop.getClaim(objective.id).status).not.toBe("KERNEL_VERIFIED")
    expect(loop.getResearch(run.id).usage.literatureSearches).toBeGreaterThan(0)
    loop.close()
    app.close()
  })
})

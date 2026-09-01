import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"
import { FakeVcs } from "@mathos/vcs"
import { OpenAlexLiteratureProvider, isPublicHttpUrl } from "@mathos/literature"

export const LITERATURE_EVAL_SCENARIOS = [
  "provider-search",
  "source-dedup",
  "source-import",
  "local-source",
  "excerpt",
  "citation",
  "external-result",
  "unsupported-extraction",
  "branch-citation-isolation",
  "external-known-not-verified",
  "search-repetition",
  "graph-projection",
  "graph-context",
] as const

export async function runLiteratureScenario(id: string): Promise<{ id: string; result: "PASS" | "FAIL"; detail?: string }> {
  const root = mkdtempSync(join(tmpdir(), `mathos-lit-${id}-`))
  try {
    const created = await MathOS.init(root, "lit")
    const app = MathOS.open(created.root, { vcs: new FakeVcs() })
    const claim = app.createClaim({ kind: "conjecture", title: "T", statement: "P", asMainObjective: true })
    let pass = false
    if (id === "provider-search") {
      const search = await app.searchLiterature("fixed point contraction")
      pass = search.provider === "fake" && search.resultCount > 0 && app.literatureHits(search.id)[0]!.title.length > 0
    } else if (id === "source-dedup" || id === "source-import") {
      const search = await app.searchLiterature("banach")
      const a = await app.importSearchResult(search.id, 0)
      const b = await app.importSearchResult(search.id, 0)
      pass = a.id === b.id && app.listSources().filter((item) => item.fingerprint === a.fingerprint).length === 1
    } else if (id === "local-source") {
      const file = join(root, "note.txt")
      writeFileSync(file, "Theorem 4.1 unique factorization.")
      const source = app.addLocalSource(file)
      pass = source.fingerprint.startsWith("file:") && Boolean(source.localPath)
    } else if (id === "excerpt" || id === "citation" || id === "external-result") {
      const source = app.importSource({ title: "P", authors: ["A"], doi: "10.2/x" })
      const excerpt = app.addExcerpt(source.id, "Theorem 3.2 compactness holds.", { kind: "THEOREM", theorem: "3.2" })
      const ext = app.extractExternalResult({ sourceId: source.id, excerptId: excerpt.id, statementSummary: "Theorem 3.2 compactness holds.", locator: { kind: "THEOREM", theorem: "3.2" } })
      const citation = app.cite({ sourceId: source.id, claimId: claim.id, purpose: "KNOWN_RESULT", locator: { kind: "THEOREM", theorem: "3.2" }, excerptId: excerpt.id, externalResultId: ext.id })
      pass = excerpt.textHash.length === 64 && citation.locator?.kind === "THEOREM" && ext.status === "EXTRACTED" && app.getClaim(claim.id).status !== "KERNEL_VERIFIED"
    } else if (id === "unsupported-extraction") {
      const source = app.importSource({ title: "P", authors: ["A"], url: "https://example.invalid/p" })
      let thrown = false
      try { app.extractExternalResult({ sourceId: source.id, statementSummary: "invented" }) } catch (error) { thrown = error instanceof Error && error.message === "UNSUPPORTED_EXTRACTION" }
      pass = thrown
    } else if (id === "branch-citation-isolation") {
      const source = app.importSource({ title: "S", authors: ["B"], isbn: "0000000000" })
      const child = await app.createBranch("side")
      app.switchBranch(child.id)
      const excerpt = app.addExcerpt(source.id, "local")
      app.cite({ sourceId: source.id, excerptId: excerpt.id, purpose: "BACKGROUND" })
      app.switchBranch("B-000")
      pass = app.listCitations("B-000").length === 0 && app.listCitations(child.id).length === 1
    } else if (id === "external-known-not-verified") {
      const source = app.importSource({ title: "S", authors: ["C"], doi: "10.3/y" })
      const excerpt = app.addExcerpt(source.id, "Theorem 1 known result text.")
      const ext = app.extractExternalResult({ sourceId: source.id, excerptId: excerpt.id, statementSummary: "Theorem 1 known result text." })
      app.reviewExternalResult(ext.id)
      const linked = app.linkExternalKnown(claim.id, ext.id)
      pass = linked.status === "EXTERNAL_KNOWN" && linked.status !== "KERNEL_VERIFIED"
    } else if (id === "search-repetition") {
      await app.searchLiterature("arithmetic")
      let thrown = false
      try { await app.searchLiterature("arithmetic") } catch (error) { thrown = error instanceof Error && error.message === "LITERATURE_SEARCH_REPETITION" }
      pass = thrown
    } else if (id === "graph-projection" || id === "graph-context") {
      const source = app.importSource({ title: "S", authors: ["D"], doi: "10.4/z" })
      const excerpt = app.addExcerpt(source.id, "fixed point theorem statement")
      const ext = app.extractExternalResult({ sourceId: source.id, excerptId: excerpt.id, statementSummary: "fixed point theorem statement" })
      app.cite({ sourceId: source.id, claimId: claim.id, purpose: "SUPPORT", excerptId: excerpt.id, externalResultId: ext.id })
      const graph = app.buildGraph({ includeLiterature: true })
      const proof = app.buildGraph({ proofOnly: true })
      const ctx = app.researchContext()
      pass = graph.nodes.some((node) => node.id === source.id) && !proof.nodes.some((node) => node.kind === "SOURCE") && ctx.summary.literatureContext.some((item) => item.externalResultId === ext.id) && ctx.text.includes("NOT KERNEL VERIFIED")
    }
    app.close()
    return { id, result: pass ? "PASS" : "FAIL" }
  } catch (error) {
    return { id, result: "FAIL", detail: error instanceof Error ? error.message : String(error) }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

export async function runLiteratureEval(opts: { real?: boolean } = {}) {
  const rows = []
  for (const id of LITERATURE_EVAL_SCENARIOS) rows.push(await runLiteratureScenario(id))
  if (opts.real) {
    try {
      if (!isPublicHttpUrl("https://api.openalex.org/works")) throw new Error("blocked")
      const provider = new OpenAlexLiteratureProvider()
      const hits = await provider.search({ text: "fundamental theorem of arithmetic", maxResults: 3 })
      const ok = hits.length > 0 && hits[0]!.title.trim().length > 0 && hits.every((hit) => hit.provider === "openalex")
      rows.push({ id: "real-openalex", result: ok ? "PASS" as const : "FAIL" as const })
    } catch (error) {
      rows.push({ id: "real-openalex", result: "FAIL" as const, detail: error instanceof Error ? error.message : String(error) })
    }
  }
  return rows
}

if (import.meta.main) {
  const rows = await runLiteratureEval({ real: process.argv.includes("--real") })
  console.log("Scenario                    Result")
  for (const row of rows) console.log(`${row.id.padEnd(27)} ${row.result}`)
  if (rows.some((row) => row.result === "FAIL")) process.exitCode = 1
}

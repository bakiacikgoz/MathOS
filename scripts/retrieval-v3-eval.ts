import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { NativeLeanAdapter } from "@mathos/lean"
import { baselineRanker, buildChannelIndex, downstreamProofSuccess, lexicalNameCandidateRanker, pairedAnalysis, promotionReport, retrieveFromDeclarations, type DownstreamExecution, type EvaluationFixture, type LeanDeclaration } from "@mathos/retrieval"

type Split = "development" | "holdout"
type Purpose = "tuning" | "final-evaluation"
interface Manifest { version: string; split: Split; frozen: boolean; caseCount: number; files: Array<{ path: string; sha256: string }> }
interface FixtureInput { id: string; domain: string; goal: string; declarations: LeanDeclaration[] }
interface GoldLabel { expectedPremises: string[]; proofSource: string }
interface Loaded { fixtures: EvaluationFixture[]; labels: Record<string, GoldLabel>; corpusSizes: Record<string, number>; pipelineStageSizes: Record<string, number> }
const ROOT = resolve(import.meta.dir, "..")
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex")
const semanticFingerprint = (goal: string) => createHash("sha256").update(goal.toLowerCase().replace(/\s+/g, " ").replace(/\b(dev|hold)[-_a-z0-9]*\b/g, "").trim()).digest("hex")

export function validateRetrievalV3Manifest(split: Split): Manifest {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, `benchmarks/retrieval-v3/${split}/manifest.json`), "utf8")) as Manifest
  if (manifest.version !== "retrieval-v3" || manifest.split !== split || manifest.frozen !== true) throw new Error("RETRIEVAL_V3_MANIFEST_INVALID")
  assertFrozenManifestFiles(manifest, ROOT)
  return manifest
}
export function assertFrozenManifestFiles(manifest: Manifest, root: string): void {
  for (const file of manifest.files) if (sha256(resolve(root, file.path)) !== file.sha256) throw new Error(`RETRIEVAL_V3_FREEZE_MISMATCH:${file.path}`)
}
export function assertRetrievalV3SplitIndependence(root = ROOT): void {
  const seen = new Map<string, string>()
  for (const split of ["development", "holdout"] as const) {
    const data = JSON.parse(readFileSync(resolve(root, `benchmarks/retrieval-v3/${split}/fixtures.json`), "utf8")) as { cases: FixtureInput[] }
    for (const item of data.cases) {
      const fingerprint = semanticFingerprint(item.goal), previous = seen.get(fingerprint)
      if (previous) throw new Error(`RETRIEVAL_V3_SEMANTIC_DUPLICATE:${previous}:${item.id}`)
      seen.set(fingerprint, item.id)
    }
  }
}
export function loadRetrievalV3Fixtures(split: Split, purpose: Purpose): Loaded {
  if (split === "holdout" && purpose === "tuning") throw new Error("RETRIEVAL_V3_HOLDOUT_GOLD_FORBIDDEN")
  assertRetrievalV3SplitIndependence()
  const manifest = validateRetrievalV3Manifest(split)
  const input = JSON.parse(readFileSync(resolve(ROOT, `benchmarks/retrieval-v3/${split}/fixtures.json`), "utf8")) as { cases: FixtureInput[] }
  const gold = JSON.parse(readFileSync(resolve(ROOT, `benchmarks/retrieval-v3/${split}/gold.json`), "utf8")) as { labels: Record<string, GoldLabel> }
  if (input.cases.length !== manifest.caseCount) throw new Error("RETRIEVAL_V3_CASE_COUNT_MISMATCH")
  const corpusSizes: Record<string, number> = {}
  const pipelineStageSizes: Record<string, number> = {}
  const fixtures = input.cases.map((item) => {
    const label = gold.labels[item.id]
    if (!label) throw new Error(`RETRIEVAL_V3_GOLD_MISSING:${item.id}`)
    const result = retrieveFromDeclarations(item.declarations, { query: item.goal, goal: item.goal, candidatePool: 200, maxPremises: 200 }, "retrieval-v3", buildChannelIndex(item.declarations))
    corpusSizes[item.id] = item.declarations.length
    pipelineStageSizes[item.id] = result.candidatePoolSize
    return { id: item.id, domain: item.domain, goal: item.goal, gold: label.expectedPremises, candidates: result.candidates.map((candidate) => ({ name: candidate.declaration.name, baselineScore: candidate.score })) }
  })
  return { fixtures, labels: gold.labels, corpusSizes, pipelineStageSizes }
}
async function executeDownstream(fixtures: EvaluationFixture[], labels: Record<string, GoldLabel>, ranker: typeof baselineRanker, k: number, adapter: NativeLeanAdapter, workspaceRoot: string): Promise<DownstreamExecution[]> {
  const rows: DownstreamExecution[] = []
  for (const fixture of fixtures) {
    const expected = labels[fixture.id]!.expectedPremises
    if (!ranker(fixture).slice(0, k).some((name) => expected.includes(name))) { rows.push({ caseId: fixture.id, executed: false, kernelAccepted: false, detail: "expected premise outside top-k; no proof execution" }); continue }
    const checked = await adapter.checkProof(labels[fixture.id]!.proofSource, { workspaceRoot })
    rows.push({ caseId: fixture.id, executed: true, kernelAccepted: checked.result === "KERNEL_ACCEPTED", detail: checked.diagnostics.map((item) => item.message).join("; ") })
  }
  return rows
}
export async function runRetrievalV3(split: Split, purpose: Purpose, options: { adapter?: NativeLeanAdapter; workspaceRoot?: string; minimumCorpusSize?: number } = {}) {
  const loaded = loadRetrievalV3Fixtures(split, purpose), paired = pairedAnalysis(loaded.fixtures)
  const adapter = options.adapter ?? new NativeLeanAdapter(), workspaceRoot = options.workspaceRoot ?? ROOT
  const environment = await adapter.detect(workspaceRoot)
  const probe = environment.leanAvailable && environment.lakeAvailable && environment.mathlib ? await adapter.probeCompile(workspaceRoot) : { ok: false, detail: "Lean/mathlib project unavailable" }
  const minimumCorpusSize = options.minimumCorpusSize ?? 30
  const corpusReady = Object.values(loaded.corpusSizes).every((size) => size >= minimumCorpusSize) && Object.values(loaded.pipelineStageSizes).every((size) => size >= minimumCorpusSize)
  let baselineRows: DownstreamExecution[] = [], candidateRows: DownstreamExecution[] = []
  if (probe.ok && corpusReady) {
    baselineRows = await executeDownstream(loaded.fixtures, loaded.labels, baselineRanker, 10, adapter, workspaceRoot)
    candidateRows = await executeDownstream(loaded.fixtures, loaded.labels, lexicalNameCandidateRanker, 10, adapter, workspaceRoot)
  }
  const downstream = { baseline: downstreamProofSuccess(baselineRows, 10), candidate: downstreamProofSuccess(candidateRows, 10) }
  const executionsValid = baselineRows.length === loaded.fixtures.length && candidateRows.length === loaded.fixtures.length && baselineRows.every((row) => row.executed) && candidateRows.every((row) => row.executed)
  const environmentReady = probe.ok && corpusReady && executionsValid
  return { version: "retrieval-v3", split, candidateChannel: "lexical-declaration-name", measuredAt: new Date().toISOString(), corpusSizes: loaded.corpusSizes, pipelineStageSizes: loaded.pipelineStageSizes, environment: { leanAvailable: environment.leanAvailable, mathlib: environment.mathlib, probe: probe.detail, corpusReady, executionsValid }, ...promotionReport(paired, downstream, environmentReady) }
}
if (import.meta.main) {
  const split = (process.argv.find((arg) => arg.startsWith("--split="))?.split("=")[1] ?? "development") as Split
  const purpose: Purpose = split === "holdout" ? "final-evaluation" : "tuning"
  const result = await runRetrievalV3(split, purpose)
  const output = resolve(ROOT, `benchmarks/retrieval-v3/results/${split}-latest.json`)
  mkdirSync(resolve(ROOT, "benchmarks/retrieval-v3/results"), { recursive: true })
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
  console.log(`${result.decision} ${output}`)
}

import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { baselineRanker, downstreamProofSuccess, lexicalNameCandidateRanker, pairedAnalysis, promotionReport, type EvaluationFixture } from "@mathos/retrieval"

type Split = "development" | "holdout"
type Purpose = "tuning" | "final-evaluation"
interface Manifest { version: string; split: Split; frozen: boolean; caseCount: number; files: Array<{ path: string; sha256: string }> }
const ROOT = resolve(import.meta.dir, "..")
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex")

export function validateRetrievalV3Manifest(split: Split): Manifest {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, `benchmarks/retrieval-v3/${split}/manifest.json`), "utf8")) as Manifest
  if (manifest.version !== "retrieval-v3" || manifest.split !== split || manifest.frozen !== true) throw new Error("RETRIEVAL_V3_MANIFEST_INVALID")
  assertFrozenManifestFiles(manifest, ROOT)
  return manifest
}

export function assertFrozenManifestFiles(manifest: Manifest, root: string): void {
  for (const file of manifest.files) if (sha256(resolve(root, file.path)) !== file.sha256) throw new Error(`RETRIEVAL_V3_FREEZE_MISMATCH:${file.path}`)
}

export function loadRetrievalV3Fixtures(split: Split, purpose: Purpose): EvaluationFixture[] {
  if (split === "holdout" && purpose === "tuning") throw new Error("RETRIEVAL_V3_HOLDOUT_GOLD_FORBIDDEN")
  const manifest = validateRetrievalV3Manifest(split)
  const fixtures = JSON.parse(readFileSync(resolve(ROOT, `benchmarks/retrieval-v3/${split}/fixtures.json`), "utf8")) as { cases: Array<Omit<EvaluationFixture, "gold">> }
  const gold = JSON.parse(readFileSync(resolve(ROOT, `benchmarks/retrieval-v3/${split}/gold.json`), "utf8")) as { labels: Record<string, { gold: string[]; proofNames: string[] }> }
  if (fixtures.cases.length !== manifest.caseCount) throw new Error("RETRIEVAL_V3_CASE_COUNT_MISMATCH")
  return fixtures.cases.map((fixture) => {
    const labels = gold.labels[fixture.id]
    if (!labels) throw new Error(`RETRIEVAL_V3_GOLD_MISSING:${fixture.id}`)
    return { ...fixture, gold: labels.gold, candidates: fixture.candidates.map((candidate) => ({ ...candidate, proofSucceeds: labels.proofNames.includes(candidate.name) })) }
  })
}

export function runRetrievalV3(split: Split, purpose: Purpose, environmentReady: boolean) {
  const fixtures = loadRetrievalV3Fixtures(split, purpose)
  const paired = pairedAnalysis(fixtures)
  const downstream = { baseline: downstreamProofSuccess(fixtures, baselineRanker, 10), candidate: downstreamProofSuccess(fixtures, lexicalNameCandidateRanker, 10) }
  return { version: "retrieval-v3", split, candidateChannel: "lexical-declaration-name", measuredAt: new Date().toISOString(), ...promotionReport(paired, downstream, environmentReady) }
}

if (import.meta.main) {
  const split = (process.argv.find((arg) => arg.startsWith("--split="))?.split("=")[1] ?? "development") as Split
  const purpose: Purpose = split === "holdout" ? "final-evaluation" : "tuning"
  let leanAvailable = false
  try { leanAvailable = Bun.spawnSync(["lean", "--version"], { stdout: "pipe", stderr: "pipe" }).exitCode === 0 } catch { leanAvailable = false }
  const result = runRetrievalV3(split, purpose, leanAvailable)
  const output = resolve(ROOT, `benchmarks/retrieval-v3/results/${split}-latest.json`)
  writeFileSync(output, `${JSON.stringify({ ...result, environment: { leanAvailable, note: leanAvailable ? "Lean available" : "Lean unavailable; promotion is inconclusive" } }, null, 2)}\n`)
  console.log(`${result.decision} ${output}`)
}

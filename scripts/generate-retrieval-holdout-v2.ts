import { createHash } from "node:crypto"
import { NativeLeanAdapter } from "@mathos/lean"
import { MATHLIB_FIXTURES, readIndex } from "@mathos/retrieval"
import { RETRIEVAL_VALIDATION_FIXTURES } from "../packages/retrieval/src/validation-fixtures.ts"
import { RETRIEVAL_HOLDOUT_FIXTURES } from "../packages/retrieval/src/holdout-fixtures.ts"
import { formalGoalFingerprint } from "../packages/retrieval/src/holdout-v2-fingerprint.ts"
import { writeFileSync } from "node:fs"

const ROOT = "/Users/yazilim/Projects/mathos"
const DEMO = `${ROOT}/demo`
const OUTPUT = `${ROOT}/packages/retrieval/src/holdout-v2-fixtures.ts`
export const HOLDOUT_V2_SEED = "mathos-retrieval-holdout-v2-2026-08-24-independent-sample"

export const HOLDOUT_V2_QUOTAS: Record<string, number> = {
  "Logic / Eq": 9, Nat: 15, Int: 15, Algebra: 20, Order: 9, Finset: 9, Set: 9, List: 9,
  Function: 9, Relations: 10, Option: 8, "Prod / Sum": 8, Maps: 8, Sequences: 8,
  Topology: 9, Analysis: 9, "Number theory": 8, Combinatorics: 8,
}

export function classifyDomain(input: { name: string; module?: string; namespace?: string }): string | null {
  const name = input.name, module = input.module ?? "", ns = input.namespace ?? name.split(".")[0] ?? ""
  if (/^(Nat)(\.|$)/u.test(name) && /Mathlib\.(Data\.Nat|NumberTheory|Algebra\.Order|Tactic)/u.test(module)) return "Nat"
  if (/^(Int)(\.|$)/u.test(name) && /Mathlib\.(Data\.Int|NumberTheory|Algebra\.Order)/u.test(module)) return "Int"
  if (/Relation|RelHom|RelEmbedding|ReflTransGen|TransGen/u.test(`${module} ${name} ${ns}`)) return "Relations"
  if (/Mathlib\.Data\.Finset|^Finset\./u.test(`${module} ${name}`)) return "Finset"
  if (/Mathlib\.Data\.Set|^Set\./u.test(`${module} ${name}`)) return "Set"
  if (/Mathlib\.Data\.List|^List\./u.test(`${module} ${name}`)) return "List"
  if (/Mathlib\.Data\.Option|^Option\./u.test(`${module} ${name}`)) return "Option"
  if (/Mathlib\.Data\.(Prod|Sum)|^(Prod|Sum)\./u.test(`${module} ${name}`)) return "Prod / Sum"
  if (/Mathlib\.Combinatorics/u.test(module)) return "Combinatorics"
  if (/Mathlib\.NumberTheory/u.test(module)) return "Number theory"
  if (/Mathlib\.Topology/u.test(module)) return "Topology"
  if (/Mathlib\.Analysis\.(SpecificLimits|SumIntegral|Convolution)|Series|Summab|Sequence|Tendsto/u.test(`${module} ${name}`)) return "Sequences"
  if (/Mathlib\.Analysis/u.test(module)) return "Analysis"
  if (/Mathlib\.(Logic\.Function|Logic\.Equiv)|^Function\./u.test(`${module} ${name}`)) return "Function"
  if (/^(Equiv|Embedding|LinearMap|ContinuousLinearMap|RingHom|MonoidHom|AddMonoidHom)\./u.test(name) || /Mathlib\.(Data\.Finsupp|LinearAlgebra\.Basic)/u.test(module)) return "Maps"
  if (/Mathlib\.Order/u.test(module)) return "Order"
  if (/Mathlib\.Logic|^(Eq|Iff|Exists|And|Or|Not)\./u.test(`${module} ${name}`)) return "Logic / Eq"
  if (/Mathlib\.Algebra/u.test(module)) return "Algebra"
  return null
}

function canonical(item: any): boolean {
  return item.origin === "mathlib" && item.kind === "theorem" && !item.unsafeForRelease &&
    item.name.length >= 4 && item.name.length <= 120 && !/[«»]|\._|match_|proof_/u.test(item.name) &&
    item.signature.length >= 25 && item.signature.length <= 1600
}
function hashOrder(domain: string, name: string): string { return createHash("sha256").update(`${HOLDOUT_V2_SEED}\0${domain}\0${name}`).digest("hex") }
function safeId(domain: string, index: number) { return `holdout_v2_${domain.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}_${String(index + 1).padStart(2, "0")}` }
function chunk<T>(values: T[], size: number): T[][] { return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, index * size + size)) }

export async function generateHoldoutV2() {
  const stored = readIndex(DEMO)
  if (!stored) throw new Error("MathOS demo index missing")
  const excludedNames = new Set([
    ...MATHLIB_FIXTURES.flatMap((fixture) => fixture.expected),
    ...RETRIEVAL_VALIDATION_FIXTURES.flatMap((fixture) => fixture.expectedAnyOf),
    ...RETRIEVAL_HOLDOUT_FIXTURES.flatMap((fixture) => fixture.expectedAnyOf),
  ].map((name) => name.toLowerCase()))
  const excludedFingerprints = new Set([
    ...MATHLIB_FIXTURES.map((fixture) => formalGoalFingerprint(fixture.goal)),
    ...RETRIEVAL_VALIDATION_FIXTURES.map((fixture) => formalGoalFingerprint(fixture.goal)),
    ...RETRIEVAL_HOLDOUT_FIXTURES.map((fixture) => formalGoalFingerprint(fixture.goal)),
  ])
  const candidates = new Map<string, any[]>()
  for (const domain of Object.keys(HOLDOUT_V2_QUOTAS)) candidates.set(domain, [])
  for (const item of stored.declarations) {
    if (!canonical(item) || excludedNames.has(item.name.toLowerCase())) continue
    const domain = classifyDomain(item)
    if (domain) candidates.get(domain)!.push(item)
  }
  for (const [domain, rows] of candidates) rows.sort((a, b) => hashOrder(domain, a.name).localeCompare(hashOrder(domain, b.name)) || a.name.localeCompare(b.name))

  const adapter = new NativeLeanAdapter()
  const selectedCandidates: Array<{ domain: string; candidate: any }> = []
  for (const [domain, quota] of Object.entries(HOLDOUT_V2_QUOTAS)) {
    const pool = candidates.get(domain)!
    const candidateCount = quota + 20
    if (pool.length < candidateCount) throw new Error(`Insufficient canonical candidates for ${domain}`)
    selectedCandidates.push(...pool.slice(0, candidateCount).map((candidate) => ({ domain, candidate })))
  }
  const inspectionMap = new Map<string, any>()
  for (const batch of chunk(selectedCandidates, 30)) {
    const inspected = await adapter.inspectDeclarations(batch.map((item) => item.candidate.name), { workspaceRoot: DEMO, formalProjectRoot: `${DEMO}/formal` } as any, { timeoutMs: 300_000 })
    if (inspected.timedOut || inspected.failed) throw new Error(`Lean inspection failed: ${inspected.detail ?? "unknown"}`)
    for (const inspection of inspected.inspections) inspectionMap.set(inspection.name, inspection)
  }
  const selected: Array<{ id: string; goal: string; expectedAnyOf: string[]; domain: string; goalFingerprint: string; sampleHash: string }> = []
  const seenFingerprints = new Set(excludedFingerprints)
  const domainIndexes = new Map<string, number>()
  for (const { domain, candidate } of selectedCandidates) {
    const current = domainIndexes.get(domain) ?? 0
    if (current >= HOLDOUT_V2_QUOTAS[domain]!) continue
    const inspection = inspectionMap.get(candidate.name)
    if (!inspection?.exists || !inspection.elaborated || !inspection.type || inspection.type.length > 2500) continue
    const id = safeId(domain, current)
    const goal = `theorem ${id} : ${inspection.type}`
    const goalFingerprint = formalGoalFingerprint(goal)
    if (seenFingerprints.has(goalFingerprint)) continue
    seenFingerprints.add(goalFingerprint)
    domainIndexes.set(domain, current + 1)
    selected.push({ id, goal, expectedAnyOf: [candidate.name], domain, goalFingerprint, sampleHash: hashOrder(domain, candidate.name) })
  }
  for (const [domain, quota] of Object.entries(HOLDOUT_V2_QUOTAS)) if ((domainIndexes.get(domain) ?? 0) !== quota) throw new Error(`Insufficient real #check fixtures for ${domain}`)
  const distribution = Object.fromEntries(Object.keys(HOLDOUT_V2_QUOTAS).map((domain) => [domain, selected.filter((item) => item.domain === domain).length]))
  const weak = new Set(["Nat", "Int", "Algebra", "Relations"])
  const weakCount = selected.filter((item) => weak.has(item.domain)).length
  const source = `export interface RetrievalHoldoutV2Fixture {\n  id: string\n  goal: string\n  expectedAnyOf: string[]\n  domain: string\n  goalFingerprint: string\n  sampleHash: string\n}\n\nexport const RETRIEVAL_HOLDOUT_V2_METADATA = ${JSON.stringify({ datasetVersion: "retrieval-holdout-v2", createdAt: "2026-08-24", leanVersion: "v4.33.1", mathlibVersion: "v4.33.1", frozen: true, samplingSeed: HOLDOUT_V2_SEED, fixtureCount: selected.length, domainDistribution: distribution, weakDomainCount: weakCount, weakDomainShare: weakCount / selected.length, sourceIndexRevision: stored.manifest.revision, sourceIndexFormatVersion: stored.manifest.formatVersion, sourceDeclarationCount: stored.manifest.declarationCount, samplingMethod: "domain-stratified canonical theorem filtering followed by SHA-256 ordering; frozen semantic feature was not consulted" }, null, 2)} as const\n\nexport const RETRIEVAL_HOLDOUT_V2_FIXTURES: RetrievalHoldoutV2Fixture[] = ${JSON.stringify(selected, null, 2)}\n`
  writeFileSync(OUTPUT, source, "utf8")
  return { fixtureCount: selected.length, distribution, weakCount, excludedExpectedDeclarations: excludedNames.size, excludedGoalFingerprints: excludedFingerprints.size, output: OUTPUT }
}

if (import.meta.main) console.log(JSON.stringify(await generateHoldoutV2(), null, 2))

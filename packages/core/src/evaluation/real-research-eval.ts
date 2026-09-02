import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

export const REAL_RESEARCH_ROOT = resolve(import.meta.dir, "../../../../benchmarks/real-research-v1")

export interface RealResearchCase {
  schemaVersion: "real-research-case-v1"
  id: string
  naturalStatement: string
  expectedFormalTarget: string
  domain: string
  difficulty: string
  knownProof: { exists: true; leanBody: string }
  requiredConcepts: string[]
  provenance: { source: string; sourceCaseId: string; openProblem: false; reviewStatus: "KNOWN_PROVED_FIXTURE" }
}

export interface RealResearchManifest {
  schemaVersion: "real-research-manifest-v1"
  datasetVersion: string
  frozen: true
  caseCount: number
  categories: string[]
  cases: Array<{ id: string; file: string; sha256: string }>
  manifestHash: string
}

const sha256 = (text: string) => createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex")

export function loadRealResearchDataset(root = REAL_RESEARCH_ROOT): { manifest: RealResearchManifest; cases: RealResearchCase[] } {
  const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8")) as RealResearchManifest
  const cases = manifest.cases.map((entry) => JSON.parse(readFileSync(resolve(root, entry.file), "utf8")) as RealResearchCase)
  return { manifest, cases }
}

export function validateRealResearchDataset(root = REAL_RESEARCH_ROOT) {
  const { manifest, cases } = loadRealResearchDataset(root)
  const errors: string[] = []
  if (manifest.caseCount < 40 || manifest.caseCount > 60 || cases.length !== manifest.caseCount) errors.push("case count must be 40–60 and match manifest")
  const ids = new Set<string>()
  for (const [index, item] of cases.entries()) {
    const entry = manifest.cases[index]!
    if (ids.has(item.id)) errors.push(`duplicate id ${item.id}`)
    ids.add(item.id)
    if (entry.id !== item.id) errors.push(`id mismatch ${entry.id}`)
    if (!item.naturalStatement || !item.expectedFormalTarget || !item.domain || !item.difficulty) errors.push(`incomplete case ${item.id}`)
    if (!item.knownProof.exists || !item.knownProof.leanBody.trim()) errors.push(`missing known proof ${item.id}`)
    if (!item.requiredConcepts.length || item.provenance.openProblem || item.provenance.reviewStatus !== "KNOWN_PROVED_FIXTURE") errors.push(`invalid provenance ${item.id}`)
    const raw = readFileSync(resolve(root, entry.file), "utf8")
    if (sha256(raw) !== entry.sha256) errors.push(`frozen hash mismatch ${item.id}`)
  }
  for (const category of manifest.categories) if (!cases.some((item) => item.domain === category)) errors.push(`uncovered category ${category}`)
  const { manifestHash: _hash, ...canonical } = manifest
  if (sha256(JSON.stringify(canonical)) !== manifest.manifestHash) errors.push("manifest hash mismatch")
  return { ok: errors.length === 0, errors, caseCount: cases.length, manifestHash: manifest.manifestHash }
}

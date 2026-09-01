import { resolve } from "node:path"
import { NativeLeanAdapter } from "@mathos/lean"
import { MATHLIB_FIXTURES } from "@mathos/retrieval"
import { RETRIEVAL_VALIDATION_FIXTURES } from "../packages/retrieval/src/validation-fixtures.ts"
import { RETRIEVAL_HOLDOUT_FIXTURES, RETRIEVAL_HOLDOUT_METADATA } from "../packages/retrieval/src/holdout-fixtures.ts"

export async function validateRetrievalHoldout() {
  const names = [...new Set(RETRIEVAL_HOLDOUT_FIXTURES.flatMap((fixture) => fixture.expectedAnyOf))]
  const development = new Set(MATHLIB_FIXTURES.flatMap((fixture) => fixture.expected).map((name) => name.toLowerCase()))
  const validation = new Set(RETRIEVAL_VALIDATION_FIXTURES.flatMap((fixture) => fixture.expectedAnyOf).map((name) => name.toLowerCase()))
  const developmentOverlap = names.filter((name) => development.has(name.toLowerCase()))
  const validationOverlap = names.filter((name) => validation.has(name.toLowerCase()))
  const adapter = new NativeLeanAdapter()
  const missing: string[] = []
  for (let index = 0; index < names.length; index += 30) {
    const batch = names.slice(index, index + 30)
    const result = await adapter.inspectDeclarations(batch, { workspaceRoot: resolve(import.meta.dir, "../demo") }, { timeoutMs: 180_000 })
    const byName = new Map(result.inspections.map((row) => [row.name, row]))
    missing.push(...batch.filter((name) => !byName.get(name)?.exists || !byName.get(name)?.elaborated))
  }
  const domains = Object.fromEntries([...new Set(RETRIEVAL_HOLDOUT_FIXTURES.map((fixture) => fixture.domain))].sort().map((domain) => [domain, RETRIEVAL_HOLDOUT_FIXTURES.filter((fixture) => fixture.domain === domain).length]))
  const failed = developmentOverlap.length > 0 || validationOverlap.length > 0 || missing.length > 0 || names.length !== RETRIEVAL_HOLDOUT_FIXTURES.length
  return { datasetVersion: RETRIEVAL_HOLDOUT_METADATA.datasetVersion, fixtureCount: RETRIEVAL_HOLDOUT_FIXTURES.length, declarationCount: names.length, domains, developmentOverlap, validationOverlap, missing, failed }
}

if (import.meta.main) {
  const report = await validateRetrievalHoldout()
  console.log(JSON.stringify(report, null, 2))
  if (report.failed) process.exitCode = 1
}

import { resolve } from "node:path"
import { NativeLeanAdapter } from "@mathos/lean"
import { MATHLIB_FIXTURES } from "@mathos/retrieval"
import { RETRIEVAL_VALIDATION_FIXTURES, RETRIEVAL_VALIDATION_METADATA } from "../packages/retrieval/src/validation-fixtures.ts"

export interface FixtureValidationReport {
  datasetVersion: string
  fixtureCount: number
  declarationCount: number
  duplicatesWithDevelopment: string[]
  missing: string[]
  failed: boolean
}

export async function validateRetrievalFixtures(): Promise<FixtureValidationReport> {
  const names = [...new Set(RETRIEVAL_VALIDATION_FIXTURES.flatMap((fixture) => fixture.expectedAnyOf))]
  const development = new Set(MATHLIB_FIXTURES.flatMap((fixture) => fixture.expected).map((name) => name.toLowerCase()))
  const duplicatesWithDevelopment = names.filter((name) => development.has(name.toLowerCase()))
  const adapter = new NativeLeanAdapter()
  const inspected = await adapter.inspectDeclarations(names, {
    workspaceRoot: resolve(import.meta.dir, "../demo"),
    formalProjectRoot: resolve(import.meta.dir, "../demo/formal"),
  }, { timeoutMs: 180_000 })
  const byName = new Map(inspected.inspections.map((row) => [row.name, row]))
  const missing = names.filter((name) => {
    const row = byName.get(name)
    return !row || !row.exists || !row.elaborated
  })
  return {
    datasetVersion: RETRIEVAL_VALIDATION_METADATA.datasetVersion,
    fixtureCount: RETRIEVAL_VALIDATION_FIXTURES.length,
    declarationCount: names.length,
    duplicatesWithDevelopment,
    missing,
    failed: inspected.failed || inspected.timedOut || missing.length > 0 || duplicatesWithDevelopment.length > 0,
  }
}

if (import.meta.main) {
  const report = await validateRetrievalFixtures()
  console.log(JSON.stringify(report, null, 2))
  if (report.failed) process.exitCode = 1
}

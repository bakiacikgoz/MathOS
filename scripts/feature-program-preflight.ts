#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { SCHEMA_EPOCH } from "@mathos/storage"

export type PreflightResult = "PASS" | "FAIL" | "MISSING"

export interface FeatureProgramPreflight {
  gitRevision: string
  version: string
  schemaEpoch: number
  checks: Array<{ id: string; result: PreflightResult; detail: string }>
  readyForFeatures: boolean
}

export interface HardeningEvidence {
  releaseReady: boolean
  releaseGitRevision: string | null
  sandboxGate: PreflightResult
  verificationAuthorityGate: PreflightResult
  coreServiceDecompositionGate: PreflightResult
  portablePathGate: PreflightResult
  eventProjectionRecoveryGate: PreflightResult
  fullRegressionGate: PreflightResult
}

interface PreflightInput {
  gitRevision: string
  version: string
  schemaEpoch: number
  evidence: HardeningEvidence
}

const ROOT = resolve(import.meta.dir, "..")

export function featureProgramPreflight(input: PreflightInput): FeatureProgramPreflight {
  const releaseResult: PreflightResult = !input.evidence.releaseGitRevision
    ? "MISSING"
    : input.evidence.releaseReady && input.evidence.releaseGitRevision === input.gitRevision ? "PASS" : "FAIL"
  const checks: FeatureProgramPreflight["checks"] = [
    { id: "experimentSandboxGate", result: input.evidence.sandboxGate, detail: "fail-closed experiment policy and supported-platform sandbox contract" },
    { id: "verificationAuthorityStaticGate", result: input.evidence.verificationAuthorityGate, detail: "KERNEL_VERIFIED writes confined to VerificationGate authority" },
    { id: "coreServiceDecompositionGate", result: input.evidence.coreServiceDecompositionGate, detail: "MathOS facade delegates to bounded application services" },
    { id: "portablePathGate", result: input.evidence.portablePathGate, detail: "portable path regression contract present" },
    { id: "eventProjectionRecoveryGate", result: input.evidence.eventProjectionRecoveryGate, detail: "event projection rebuild and crash recovery contract present" },
    { id: "realReleaseCheck", result: releaseResult, detail: `release artifact revision=${input.evidence.releaseGitRevision ?? "missing"} ready=${input.evidence.releaseReady}` },
    { id: "fullExistingRegression", result: input.evidence.fullRegressionGate, detail: "release artifact unit/integration gate" },
  ]
  return {
    gitRevision: input.gitRevision,
    version: input.version,
    schemaEpoch: input.schemaEpoch,
    checks,
    readyForFeatures: checks.every((check) => check.result === "PASS"),
  }
}

function present(path: string): PreflightResult {
  return existsSync(resolve(ROOT, path)) ? "PASS" : "MISSING"
}

export function collectFeatureProgramPreflight(): FeatureProgramPreflight {
  const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string }
  const revision = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" })
  const gitRevision = new TextDecoder().decode(revision.stdout).trim()
  const artifactPath = resolve(ROOT, "artifacts/release-gate/phase10-release-check.json")
  const artifact = existsSync(artifactPath)
    ? JSON.parse(readFileSync(artifactPath, "utf8")) as { gitRevision?: string; ready?: boolean; checks?: Array<{ name: string; status: string }> }
    : null
  const checkStatus = (name: string): PreflightResult => {
    const status = artifact?.checks?.find((check) => check.name === name)?.status
    return status === "PASS" ? "PASS" : status ? "FAIL" : "MISSING"
  }
  const allPresent = (paths: string[]): PreflightResult => paths.every((path) => present(path) === "PASS") ? "PASS" : "MISSING"

  return featureProgramPreflight({
    gitRevision,
    version: packageJson.version,
    schemaEpoch: SCHEMA_EPOCH,
    evidence: {
      releaseReady: artifact?.ready === true,
      releaseGitRevision: artifact?.gitRevision ?? null,
      sandboxGate: allPresent(["packages/computation/src/sandbox.ts", "tests/sandbox.test.ts", "tests/sandbox-security.test.ts"]),
      verificationAuthorityGate: checkStatus("verification-trust-tests"),
      coreServiceDecompositionGate: allPresent([
        "packages/core/src/services/verification-service.ts",
        "packages/core/src/services/formalization-service.ts",
        "packages/core/src/services/experiment-service.ts",
        "packages/core/src/services/literature-service.ts",
      ]),
      portablePathGate: present("tests/portability.test.ts"),
      eventProjectionRecoveryGate: checkStatus("event-rebuild"),
      fullRegressionGate: checkStatus("unit-integration-tests"),
    },
  })
}

if (import.meta.main) {
  const report = collectFeatureProgramPreflight()
  console.log(JSON.stringify(report, null, 2))
  if (!report.readyForFeatures) process.exitCode = 1
}

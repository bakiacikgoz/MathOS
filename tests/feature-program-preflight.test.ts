import { describe, expect, test } from "bun:test"
import { featureProgramPreflight, type HardeningEvidence } from "../scripts/feature-program-preflight.ts"

const passingEvidence: HardeningEvidence = {
  releaseReady: true,
  releaseGitRevision: "abc123",
  sandboxGate: "PASS",
  verificationAuthorityGate: "PASS",
  coreServiceDecompositionGate: "PASS",
  portablePathGate: "PASS",
  eventProjectionRecoveryGate: "PASS",
  fullRegressionGate: "PASS",
}

describe("MathOS v1 feature program preflight", () => {
  test("is ready only when every 0.2 hardening prerequisite passes", () => {
    const report = featureProgramPreflight({
      gitRevision: "abc123",
      version: "1.0.0-rc.1",
      schemaEpoch: 20,
      evidence: passingEvidence,
    })

    expect(report.readyForFeatures).toBe(true)
    expect(report.checks.every((check) => check.result === "PASS")).toBe(true)
  })

  test.each([
    ["sandboxGate", "experimentSandboxGate"],
    ["verificationAuthorityGate", "verificationAuthorityStaticGate"],
    ["coreServiceDecompositionGate", "coreServiceDecompositionGate"],
    ["portablePathGate", "portablePathGate"],
    ["eventProjectionRecoveryGate", "eventProjectionRecoveryGate"],
    ["fullRegressionGate", "fullExistingRegression"],
  ] as const)("fails closed when %s is missing", (gate, checkId) => {
    const report = featureProgramPreflight({
      gitRevision: "abc123",
      version: "1.0.0-rc.1",
      schemaEpoch: 20,
      evidence: { ...passingEvidence, [gate]: "MISSING" },
    })

    expect(report.readyForFeatures).toBe(false)
    expect(report.checks.find((check) => check.id === checkId)?.result).toBe("MISSING")
  })

  test("rejects a release artifact from another revision", () => {
    const report = featureProgramPreflight({
      gitRevision: "abc123",
      version: "1.0.0-rc.1",
      schemaEpoch: 20,
      evidence: { ...passingEvidence, releaseGitRevision: "stale456" },
    })

    expect(report.readyForFeatures).toBe(false)
    expect(report.checks.find((check) => check.id === "realReleaseCheck")?.result).toBe("FAIL")
  })
})

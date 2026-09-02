import { describe, expect, test } from "bun:test"
import {
  CONTEXT_ITEM_KINDS,
  RESEARCH_BLOCK_KINDS,
  SOLVER_TRUST_ORDER,
  parseBridgeHello,
  parseConjectureDraft,
  parseContextItemDraft,
  parsePluginManifestV1,
  parseSolverRawResult,
  validateCapsuleArtifactPath,
} from "@mathos/domain"

describe("MathOS v1 domain contracts", () => {
  test("exports canonical enum values", () => {
    expect(CONTEXT_ITEM_KINDS).toEqual(["ASSUMPTION", "SYMBOL", "NOTATION", "DOMAIN_CONSTRAINT", "CONVENTION", "DEFINITION_REF"])
    expect(RESEARCH_BLOCK_KINDS).toContain("FAILED_APPROACH")
    expect(SOLVER_TRUST_ORDER).toEqual(["UNTRUSTED", "WITNESS_CHECKED", "CERTIFICATE_CHECKED", "LEAN_REPLAYED"])
  })

  test("model-origin context is proposal-only", () => {
    expect(() => parseContextItemDraft({ kind: "SYMBOL", canonicalName: "x", displayText: "x", normalizedValue: "x", origin: "MODEL", status: "ACTIVE" })).toThrow("MODEL_CONTEXT_MUST_BE_PROPOSED")
    expect(parseContextItemDraft({ kind: "SYMBOL", canonicalName: "x", displayText: "x", normalizedValue: "x", origin: "MODEL" }).status).toBe("PROPOSED")
  })

  test("solver and conjecture payloads cannot carry claim authority", () => {
    expect(() => parseSolverRawResult({ outcome: "SAT", trustClass: "UNTRUSTED", claimStatus: "KERNEL_VERIFIED" })).toThrow("FORBIDDEN_AUTHORITY_FIELD")
    expect(() => parseConjectureDraft({ naturalStatement: "P", rationale: "pattern", forceVerified: true })).toThrow("FORBIDDEN_AUTHORITY_FIELD")
  })

  test("bridge and plugin protocols are versioned and plugin permissions deny wildcards", () => {
    expect(parseBridgeHello({ protocol: "mathos-bridge-v1", client: { name: "test", version: "1" }, workspaceRoot: "/tmp/ws", requestedCapabilities: [] }).protocol).toBe("mathos-bridge-v1")
    expect(() => parseBridgeHello({ protocol: "latest" })).toThrow("BRIDGE_PROTOCOL_UNSUPPORTED")
    expect(parsePluginManifestV1({ schemaVersion: "mathos-plugin-v1", id: "safe", name: "Safe", version: "1.0.0", protocol: "json-rpc-2.0-stdio", kind: "SOLVER", executable: "safe-solver", args: [], permissions: { networkHosts: [], readRoots: [], writeRoots: [], executables: ["safe-solver"], environmentVariables: [], maxRuntimeMs: 1000, maxOutputBytes: 1024 } }).schemaVersion).toBe("mathos-plugin-v1")
    expect(() => parsePluginManifestV1({ schemaVersion: "mathos-plugin-v1", id: "unsafe", permissions: { networkHosts: ["*"] } })).toThrow("PLUGIN_WILDCARD_PERMISSION_DENIED")
  })

  test("capsule artifact paths are portable relative paths", () => {
    expect(validateCapsuleArtifactPath("formal/Claims/C001.lean")).toBe("formal/Claims/C001.lean")
    expect(() => validateCapsuleArtifactPath("../secret")).toThrow("CAPSULE_PATH_UNSAFE")
    expect(() => validateCapsuleArtifactPath("C:\\Users\\name\\secret")).toThrow("CAPSULE_PATH_UNSAFE")
  })
})

import type { ModelProfile } from "../profile.ts"
import type { ModelRole } from "../types.ts"
import type { ModelProfileV2 } from "./types.ts"
const ALL_ROLES: ModelRole[] = ["primary","auditor","alignment","planner","repair","intake","formalizer","prover","checker","literature_synthesis","researcher"]
export function migrateModelProfileV1(profile: ModelProfile, timestamp = new Date().toISOString()): ModelProfileV2 {
  return { schemaVersion: "mathos.model-profile.v2", id: profile.id, descriptorId: "generic-openai-compatible", displayName: profile.id, model: profile.model,
    endpointPresetId: null, baseUrlOverride: profile.baseUrl.replace(/\/$/, ""), auth: profile.secretRef ? { kind: "secret-ref", secretRef: profile.secretRef } : { kind: "none" }, enabled: true,
    timeoutMs: profile.timeoutMs ?? 60_000, maxResponseBytes: profile.maxResponseBytes ?? 2_000_000, maxOutputTokens: null, reasoningEffort: null,
    allowedRoles: [...ALL_ROLES], requestConcurrency: 1, metadata: { createdAt: timestamp, updatedAt: timestamp, migratedFromV1: true } }
}

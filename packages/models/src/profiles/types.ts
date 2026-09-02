import type { ModelRole } from "../types.ts"
export const MODEL_PROFILE_V2_SCHEMA = "mathos.model-profile.v2" as const
export const MODEL_PROFILE_STORE_V2_SCHEMA = "mathos.model-profiles.v2" as const
export type ModelProfileAuth = { kind: "none" } | { kind: "secret-ref"; secretRef: string } | { kind: "upstream-client"; accountAlias: string | null; clientHome: string | null } | { kind: "copilot-logged-in-user" } | { kind: "application-default"; projectId: string | null; location: string | null }
export interface ModelProfileV2 {
  schemaVersion: typeof MODEL_PROFILE_V2_SCHEMA; id: string; descriptorId: string; displayName: string; model: string | "auto"; endpointPresetId: string | null; baseUrlOverride: string | null
  auth: ModelProfileAuth; enabled: boolean; timeoutMs: number; maxResponseBytes: number; maxOutputTokens: number | null; reasoningEffort: "none" | "low" | "medium" | "high" | "max" | null
  allowedRoles: ModelRole[]; requestConcurrency: number; metadata: { createdAt: string; updatedAt: string; migratedFromV1: boolean }
}
export interface ModelProfileStoreV2 { schemaVersion: typeof MODEL_PROFILE_STORE_V2_SCHEMA; profiles: ModelProfileV2[] }

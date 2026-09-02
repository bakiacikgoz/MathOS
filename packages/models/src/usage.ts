import type { ModelRole } from "./types.ts"
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname } from "node:path"
import type { ProviderBillingClass, ProviderTransportKind } from "./catalog/types.ts"
import type { ModelRouteState } from "./routing/fallback.ts"
export const MODEL_USAGE_V2_SCHEMA = "mathos.model-usage.v2" as const
export interface ModelRequestSnapshot { researchRunId: string; profileId: string; descriptorId: string; model: string; catalogRevision: string; role: ModelRole }
export interface ModelUsageRecord { schemaVersion?: typeof MODEL_USAGE_V2_SCHEMA; profileId: string; descriptorId?: string; model: string; role: ModelRole; billingClass?: ProviderBillingClass; transport?: ProviderTransportKind; routeState?: ModelRouteState; inputTokens?: number; outputTokens?: number; durationMs: number; retries: number; success: boolean; errorClass?: string; researchRunId?: string; requestSnapshot?: ModelRequestSnapshot; recordedAt?: string }
export function createModelRequestSnapshot(input: ModelRequestSnapshot): ModelRequestSnapshot { return { researchRunId: input.researchRunId, profileId: input.profileId, descriptorId: input.descriptorId, model: input.model, catalogRevision: input.catalogRevision, role: input.role } }
function sanitizeUsage(input: ModelUsageRecord): ModelUsageRecord { const snapshot = input.requestSnapshot ? createModelRequestSnapshot(input.requestSnapshot) : undefined; return { schemaVersion: MODEL_USAGE_V2_SCHEMA, profileId: input.profileId, model: input.model, role: input.role, durationMs: Math.max(0, input.durationMs), retries: Math.max(0, input.retries), success: input.success, ...(input.descriptorId ? { descriptorId: input.descriptorId } : {}), ...(input.billingClass ? { billingClass: input.billingClass } : {}), ...(input.transport ? { transport: input.transport } : {}), ...(input.routeState ? { routeState: input.routeState } : {}), ...(Number.isFinite(input.inputTokens) ? { inputTokens: input.inputTokens } : {}), ...(Number.isFinite(input.outputTokens) ? { outputTokens: input.outputTokens } : {}), ...(input.errorClass ? { errorClass: input.errorClass } : {}), ...(input.researchRunId ? { researchRunId: input.researchRunId } : {}), ...(snapshot ? { requestSnapshot: snapshot } : {}), recordedAt: input.recordedAt ?? new Date().toISOString() } }
export class ModelUsageLedger {
  private readonly rows: ModelUsageRecord[] = []
  record(input: ModelUsageRecord): ModelUsageRecord { const row = sanitizeUsage(input); this.rows.push(row); return { ...row } }
  current(): ModelUsageRecord[] { return this.rows.map(row => ({ ...row })) }
  research(id: string): ModelUsageRecord[] { return this.current().filter(row => row.researchRunId === id) }
}
export class FileModelUsageLedger {
  constructor(private readonly path: string) {}
  record(input: ModelUsageRecord): ModelUsageRecord { const row = sanitizeUsage(input); mkdirSync(dirname(this.path), { recursive: true }); appendFileSync(this.path, `${JSON.stringify(row)}\n`, { encoding: "utf8", mode: 0o600 }); return row }
  current(): ModelUsageRecord[] { if (!existsSync(this.path)) return []; return readFileSync(this.path, "utf8").split(/\r?\n/).filter(Boolean).map(line => sanitizeUsage(JSON.parse(line) as ModelUsageRecord)) }
  research(id: string): ModelUsageRecord[] { return this.current().filter(row => row.researchRunId === id) }
}

import type { ModelRole } from "./types.ts"
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname } from "node:path"
export interface ModelUsageRecord { profileId: string; model: string; role: ModelRole; inputTokens?: number; outputTokens?: number; durationMs: number; retries: number; success: boolean; errorClass?: string; researchRunId?: string; recordedAt?: string }
function sanitizeUsage(input: ModelUsageRecord): ModelUsageRecord { return { profileId: input.profileId, model: input.model, role: input.role, durationMs: Math.max(0, input.durationMs), retries: Math.max(0, input.retries), success: input.success, ...(Number.isFinite(input.inputTokens) ? { inputTokens: input.inputTokens } : {}), ...(Number.isFinite(input.outputTokens) ? { outputTokens: input.outputTokens } : {}), ...(input.errorClass ? { errorClass: input.errorClass } : {}), ...(input.researchRunId ? { researchRunId: input.researchRunId } : {}), recordedAt: input.recordedAt ?? new Date().toISOString() } }
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

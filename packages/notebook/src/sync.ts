export interface NotebookSyncInput { id:string; baselineSourceHash:string; baselineTargetHash:string; sourceHash:string; targetHash:string; fields:string[] }
export interface NotebookSyncPlan extends NotebookSyncInput { status:"PROPOSED"|"CONFLICT"|"APPLIED"; reason:string|null }
const SAFE_FIELDS = new Set(["status","caption","reference","generatedMetadata"])
export class NotebookSyncEngine {
  private readonly consumed = new Set<string>()
  plan(input:NotebookSyncInput):NotebookSyncPlan {
    const bothChanged = input.sourceHash !== input.baselineSourceHash && input.targetHash !== input.baselineTargetHash
    const unsafe = input.fields.some((field) => !SAFE_FIELDS.has(field))
    return { ...input, status:bothChanged || unsafe ? "CONFLICT" : "PROPOSED", reason:bothChanged ? "BOTH_SIDES_CHANGED" : unsafe ? "UNSAFE_FIELD" : null }
  }
  apply(plan:NotebookSyncPlan):NotebookSyncPlan {
    if (this.consumed.has(plan.id)) throw new Error(`SYNC_PLAN_CONSUMED: ${plan.id}`)
    if (plan.status === "CONFLICT") throw new Error(`SYNC_PLAN_CONFLICT: ${plan.reason}`)
    this.consumed.add(plan.id)
    return { ...plan, status:"APPLIED" }
  }
}

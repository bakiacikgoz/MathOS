import { createHash } from "node:crypto"

export const CONTEXT_ITEM_KINDS = ["ASSUMPTION", "SYMBOL", "NOTATION", "DOMAIN_CONSTRAINT", "CONVENTION", "DEFINITION_REF"] as const
export type ContextItemKind = typeof CONTEXT_ITEM_KINDS[number]
export type ContextScopeKind = "WORKSPACE" | "BRANCH" | "DOCUMENT" | "CLAIM"
export type ContextItemStatus = "PROPOSED" | "ACTIVE" | "REJECTED" | "SUPERSEDED"
export type ContextItemOrigin = "USER" | "MODEL" | "IMPORT"
export interface MathematicalContextItem { id:string; workspaceId:string; branchId:string; scopeKind:ContextScopeKind; scopeId:string; kind:ContextItemKind; canonicalName:string; displayText:string; normalizedValue:string; leanExpression:string|null; sourceClaimId:string|null; status:ContextItemStatus; origin:ContextItemOrigin; revision:number; contentHash:string; createdAt:string; updatedAt:string }
export interface ContextItemDraft { kind:ContextItemKind; canonicalName:string; displayText:string; normalizedValue?:string; leanExpression?:string|null; sourceClaimId?:string|null; origin:ContextItemOrigin; status?:ContextItemStatus }
export interface MathematicalContextSnapshot { revisionId:string; snapshotHash:string; items:MathematicalContextItem[] }
export interface ContextConflict { kind:string; itemIds:string[]; message:string }
export interface ContextImpactReport { itemId:string; affectedEntityIds:string[] }
export interface ContextApplyResult { item:MathematicalContextItem; supersededItemId:string|null }
export function parseContextItemDraft(value: ContextItemDraft): ContextItemDraft & { status: ContextItemStatus } {
  if (!value.canonicalName?.trim()) throw new Error("CONTEXT_CANONICAL_NAME_REQUIRED")
  if ((value.kind === "SYMBOL" || value.kind === "NOTATION") && !value.normalizedValue?.trim()) throw new Error("CONTEXT_NORMALIZED_VALUE_REQUIRED")
  if (value.kind === "DEFINITION_REF" && !value.sourceClaimId) throw new Error("CONTEXT_DEFINITION_REF_REQUIRED")
  if (value.origin === "MODEL" && value.status === "ACTIVE") throw new Error("MODEL_CONTEXT_MUST_BE_PROPOSED")
  return { ...value, canonicalName:value.canonicalName.trim(), status:value.origin === "MODEL" ? "PROPOSED" : value.status ?? "PROPOSED" }
}
export const canonicalContextHash = (items:MathematicalContextItem[]) => createHash("sha256").update(JSON.stringify([...items].sort((a,b)=>a.id.localeCompare(b.id)).map(({id,revision,contentHash})=>({id,revision,contentHash})))).digest("hex")

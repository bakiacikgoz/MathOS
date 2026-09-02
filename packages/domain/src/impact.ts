export interface EntityRevisionRef { entityType:string; entityId:string; revision:number; contentHash:string }
export interface EntityRevisionChange { before:EntityRevisionRef|null; after:EntityRevisionRef }
export interface StaleMarker { id:string; targetType:string; targetId:string; sourceType:string; sourceId:string; reasonCode:string; detectedAt:string; resolvedAt:string|null; requiredAction:string; previousStatus:string|null; projectionStatus:string }
export interface ImpactReport { id:string; source:EntityRevisionRef; affected:EntityRevisionRef[] }
export interface RevalidationPlan { entityType:string; entityId:string; steps:string[] }

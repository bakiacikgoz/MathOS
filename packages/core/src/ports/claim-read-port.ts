import type { Claim } from "@mathos/domain"
export interface ClaimReadPort { get(id: string): Claim | null; list(workspaceId: string): Claim[] }

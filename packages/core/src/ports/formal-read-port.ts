import type { FormalStatement } from "@mathos/domain"
export interface FormalReadPort { get(id: string): FormalStatement | null; currentForClaim(claimId: string): FormalStatement | null }

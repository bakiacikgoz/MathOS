import type { Dependency } from "@mathos/domain"
export interface GraphReadPort { dependencies(workspaceId: string): Dependency[] }

import type { Database } from "bun:sqlite"
import { V1Repository } from "./v1-repository-utils.ts"

type Row = { id: string; revision?: number; [key: string]: unknown }
const itemColumns = ["id","workspaceId","branchId","scopeKind","scopeId","kind","canonicalName","displayText","normalizedValue","leanExpression","sourceClaimId","status","origin","revision","contentHash","createdAt","updatedAt"] as const

export class ContextItemRepository extends V1Repository<Row> {
  constructor(db: Database) { super(db, "context_items", itemColumns, [], "canonical_name") }

  activateAndSupersede(id: string): Row {
    return this.db.transaction(() => {
      const item = this.get(id)
      if (!item) throw new Error(`CONTEXT_NOT_FOUND: ${id}`)
      this.db.query(`UPDATE context_items SET status='SUPERSEDED', revision=revision+1, updated_at=? WHERE scope_kind=? AND scope_id=? AND kind=? AND canonical_name=? AND status='ACTIVE' AND id<>?`).run(...[item.updatedAt, item.scopeKind, item.scopeId, item.kind, item.canonicalName, id] as never[])
      this.db.query(`UPDATE context_items SET status='ACTIVE', revision=revision+1 WHERE id=? AND status IN ('PROPOSED','ACTIVE')`).run(id)
      return this.get(id)!
    })()
  }
}

export class ContextRevisionRepository extends V1Repository<Row> {
  constructor(db: Database) { super(db, "context_revisions", ["id","workspaceId","branchId","snapshotHash","parentRevisionId","changedItemIds","createdBy","createdAt"], ["changedItemIds"], "created_at") }
}

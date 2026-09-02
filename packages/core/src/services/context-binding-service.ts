import type { ContextBindingConflict, ContextBindingResult, MathematicalContextItem } from "@mathos/domain"

export interface ContextBindingScope {
  workspaceId: string
  branchId: string
  documentId?: string
  claimId?: string
  knownClaimIds: ReadonlySet<string>
  /** Deliberately ignored: context is inert data and can never invoke tools. */
  onToolInvocation?: () => void
}

const canonical = (value: string) => value.normalize("NFC")
const latex = (value: string) => value.normalize("NFC").replace(/\s+/g, "").replace(/[{}]/g, "")

export class ContextBindingService {
  bind(items: MathematicalContextItem[], scope: ContextBindingScope): ContextBindingResult {
    const order = new Map<string, number>([["WORKSPACE",0],["BRANCH",1],["DOCUMENT",2],["CLAIM",3]])
    const ids = new Set([scope.workspaceId, scope.branchId, scope.documentId, scope.claimId].filter((value): value is string => Boolean(value)))
    const applicable = items.filter((item) => item.status === "ACTIVE" && ids.has(item.scopeId)).sort((a, b) => (order.get(a.scopeKind)! - order.get(b.scopeKind)!) || a.id.localeCompare(b.id))
    const selected = new Map<string, MathematicalContextItem>()
    for (const item of applicable) selected.set(`${item.kind}:${canonical(item.canonicalName)}`, item)
    const effective = [...selected.values()].sort((a, b) => a.id.localeCompare(b.id))
    const conflicts: ContextBindingConflict[] = []

    const latexGroups = new Map<string, MathematicalContextItem[]>()
    for (const item of effective.filter((value) => value.normalizedValue.startsWith("\\"))) {
      const key = latex(item.normalizedValue)
      latexGroups.set(key, [...(latexGroups.get(key) ?? []), item])
    }
    for (const group of latexGroups.values()) if (new Set(group.map((item) => canonical(item.canonicalName))).size > 1) conflicts.push({ reasonCode:"LATEX_ALIAS_COLLISION", itemIds:group.map((item) => item.id).sort(), message:"Multiple names resolve to the same LaTeX alias" })

    const aliases = new Map(effective.filter((item) => item.normalizedValue.startsWith("alias:")).map((item) => [canonical(item.canonicalName), canonical(item.normalizedValue.slice(6))]))
    const visited = new Set<string>()
    const active = new Set<string>()
    let circular: string[] | null = null
    const visit = (name: string, path: string[]) => {
      if (active.has(name)) { circular = [...path.slice(path.indexOf(name)), name]; return }
      if (visited.has(name) || circular) return
      visited.add(name); active.add(name)
      const next = aliases.get(name); if (next) visit(next, [...path, name])
      active.delete(name)
    }
    for (const name of aliases.keys()) visit(name, [])
    if (circular) {
      const names = new Set<string>(circular)
      conflicts.push({ reasonCode:"CIRCULAR_ALIAS", itemIds:effective.filter((item) => names.has(canonical(item.canonicalName))).map((item) => item.id).sort(), message:"Context aliases form a cycle" })
    }

    const bindings = effective.filter((item) => item.kind === "DEFINITION_REF" && item.sourceClaimId && scope.knownClaimIds.has(item.sourceClaimId) && scope.claimId).map((item) => ({ contextItemId:item.id, fromClaimId:scope.claimId!, toClaimId:item.sourceClaimId!, relation:"depends_on" as const }))
    for (const item of effective.filter((value) => value.kind === "DEFINITION_REF" && (!value.sourceClaimId || !scope.knownClaimIds.has(value.sourceClaimId)))) conflicts.push({ reasonCode:"MISSING_DEFINITION_REF", itemIds:[item.id], message:"Definition reference does not resolve to a known claim" })
    return { effective, conflicts: conflicts.sort((a, b) => a.reasonCode.localeCompare(b.reasonCode)), bindings }
  }
}

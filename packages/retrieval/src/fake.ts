import type { LeanAdapter } from "@mathos/lean"
import type { LeanDeclaration, PremiseRetrievalRequest, PremiseRetrievalResult, PremiseRetriever } from "./types.ts"
import { retrieveFromDeclarations } from "./pipeline.ts"
import { applyLeanEnrichment } from "./enrich.ts"
import { AggregateInspectSelector, StratifiedInspectSelector } from "./inspect-selector.ts"

export class InMemoryPremiseRetriever implements PremiseRetriever {
  lastRequest: PremiseRetrievalRequest | null = null
  retrieveCalls = 0

  constructor(
    private readonly declarations: LeanDeclaration[] = [],
    private readonly leanAdapter: LeanAdapter | null = null,
  ) {}

  replace(declarations: LeanDeclaration[]): void {
    this.declarations.splice(0, this.declarations.length, ...declarations)
  }

  async retrieve(request: PremiseRetrievalRequest): Promise<PremiseRetrievalResult> {
    this.retrieveCalls += 1
    this.lastRequest = request
    const header = retrieveFromDeclarations(this.declarations, request, "memory")
    header.enrichment = "HEADER"
    header.candidatePoolSize = header.candidates.length
    if (request.skipInspect || !this.leanAdapter) return header
    const selector = header.goalProfile ? new StratifiedInspectSelector() : new AggregateInspectSelector()
    const selection = selector.select(header.candidates, header.goalProfile ?? {
      rawTarget: request.goal ?? request.query,
      constants: [], namespaces: [], typeConstructors: [], operators: [], localTypes: [], conclusionTokens: [],
      isEquality: false, isIff: false, isImplication: false, isExistential: false, isUniversal: false, known: false,
    }, request.inspectTopK ?? 30)
    const names = selection.selected.map((item) => item.candidate.declaration.name)
    const reasonByName = new Map(selection.selected.map((item) => [item.candidate.declaration.name, item.selectionReason]))
    header.candidates = header.candidates.map((item, index) => ({ ...item, stage1Rank: index + 1, selectionReason: reasonByName.get(item.declaration.name) }))
    header.inspectSelectionStrategy = selection.strategy
    header.inspectSelectorVersion = selection.selectorVersion
    header.inspectionLimit = request.inspectTopK ?? 30
    header.inspectedCandidates = names
    header.selectionReasons = Object.fromEntries(selection.selected.map((item) => [item.candidate.declaration.name, item.selectionReason]))
    const inspected = await this.leanAdapter.inspectDeclarations(names, { workspaceRoot: "." })
    if (inspected.failed || inspected.timedOut) {
      return { ...header, enrichment: "LEAN_ENRICHMENT_FAILED" }
    }
    return applyLeanEnrichment(header, inspected.inspections, request, new Set())
  }
}

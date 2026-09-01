import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { LeanAdapter, LeanDeclarationInspection } from "@mathos/lean"
import type { LeanDeclaration, PremiseRetrievalRequest, PremiseRetrievalResult, PremiseRetriever } from "./types.ts"
import { resolveRetrievalConfig } from "./config.ts"
import { fingerprintFiles, hashText } from "./fingerprint.ts"
import { retrieveFromDeclarations } from "./pipeline.ts"
import { applyLeanEnrichment } from "./enrich.ts"
import { AggregateInspectSelector, StratifiedInspectSelector } from "./inspect-selector.ts"
import { INDEX_FORMAT_VERSION, buildChannelIndex } from "./channels.ts"
import { lookupInspection, readInspectionCache, storeInspection, writeInspectionCache, inspectionCacheStats } from "./inspect-cache.ts"
import { findMathlibRoot, findInitRoot, mathlibRevisionFromLakefile, scanLeanTree, seedDeclarations } from "./scan.ts"
import { indexStatus, readIndex, writeIndex } from "./store.ts"
import type { IndexManifest, IndexStatus } from "./types.ts"

export interface LocalClaimDecl {
  name: string
  signature: string
  claimId: string
  claimStatus: string
}

export class HybridPremiseRetriever implements PremiseRetriever {
  constructor(
    private readonly workspaceRoot: string,
    private readonly extras: () => LocalClaimDecl[] = () => [],
    private readonly leanAdapter: LeanAdapter | null = null,
  ) {}

  expectedFingerprint(leanVersion: string | null): {
    leanVersion: string | null
    mathlibRevision: string | null
    formalFingerprint: string
    verifiedFingerprint: string
  } {
    const project = existsSync(join(this.workspaceRoot, "formal", "lakefile.toml"))
      ? join(this.workspaceRoot, "formal")
      : this.workspaceRoot
    return {
      leanVersion,
      mathlibRevision: mathlibRevisionFromLakefile(project),
      formalFingerprint: fingerprintFiles(this.workspaceRoot, ["formal"]),
      verifiedFingerprint: hashText(
        this.extras()
          .filter((item) => item.claimStatus === "KERNEL_VERIFIED")
          .map((item) => item.claimId)
          .sort()
          .join(","),
      ),
    }
  }

  status(leanVersion: string | null): IndexStatus {
    const stored = readIndex(this.workspaceRoot)
    const expected = this.expectedFingerprint(leanVersion ?? stored?.manifest.leanVersion ?? null)
    return {
      ...indexStatus(this.workspaceRoot, expected),
      inspectionCache: inspectionCacheStats(this.workspaceRoot, expected.leanVersion, expected.mathlibRevision),
    }
  }

  build(leanVersion: string | null): IndexManifest {
    const project = existsSync(join(this.workspaceRoot, "formal")) ? join(this.workspaceRoot, "formal") : this.workspaceRoot
    const workspaceDecls = scanLeanTree(join(this.workspaceRoot, "formal"), "workspace", "formal")
    const mathlibRoot = findMathlibRoot(project)
    const mathlibDecls = mathlibRoot ? scanLeanTree(mathlibRoot, "mathlib", "Mathlib") : []
    const initRoot = findInitRoot()
    const initDecls = initRoot ? scanLeanTree(initRoot, "mathlib", "Init") : []
    const declarations = dedupe([...seedDeclarations(), ...initDecls, ...workspaceDecls, ...mathlibDecls])
    const expected = this.expectedFingerprint(leanVersion)
    const channels = buildChannelIndex(declarations)
    const manifest: IndexManifest = {
      revision: hashText(`${expected.leanVersion}|${expected.mathlibRevision}|${expected.formalFingerprint}|${expected.verifiedFingerprint}|${declarations.length}|${INDEX_FORMAT_VERSION}`),
      formatVersion: INDEX_FORMAT_VERSION,
      leanVersion: expected.leanVersion,
      mathlibRevision: expected.mathlibRevision,
      formalFingerprint: expected.formalFingerprint,
      verifiedFingerprint: expected.verifiedFingerprint,
      builtAt: new Date().toISOString(),
      declarationCount: declarations.length,
      mathlibCount: declarations.filter((item) => item.origin === "mathlib").length,
      workspaceCount: declarations.filter((item) => item.origin === "workspace").length,
      channelCounts: channels.counts,
    }
    writeIndex(this.workspaceRoot, manifest, declarations, channels)
    return manifest
  }

  async retrieve(request: PremiseRetrievalRequest): Promise<PremiseRetrievalResult> {
    const stored = readIndex(this.workspaceRoot)
    const liveLocal = this.extras().map(
      (item): LeanDeclaration => ({
        name: item.name,
        kind: "theorem",
        signature: item.signature,
        origin: "workspace",
        claimId: item.claimId,
        claimStatus: item.claimStatus,
      }),
    )
    const declarations = dedupe([...(stored?.declarations ?? seedDeclarations()), ...liveLocal])
    const config = resolveRetrievalConfig(this.workspaceRoot)
    const inspectTopK = request.inspectTopK ?? config.inspectTopK
    const header = retrieveFromDeclarations(
      declarations,
      { ...request, maxPremises: Math.max(inspectTopK, request.maxPremises ?? config.maxPremises), candidatePool: config.candidatePool },
      stored?.manifest.revision ?? null,
      stored?.channels,
    )
    header.candidatePoolSize = header.candidates.length
    header.enrichment = "HEADER"
    if (request.skipInspect || request.goalAware === false || !this.leanAdapter) {
      return { ...header, candidates: header.candidates.slice(0, request.maxPremises ?? config.maxPremises) }
    }
    try {
      const selector = header.goalProfile ? new StratifiedInspectSelector() : new AggregateInspectSelector()
      const selection = selector.select(header.candidates, header.goalProfile ?? {
        rawTarget: request.goal ?? request.query,
        constants: [], namespaces: [], typeConstructors: [], operators: [], localTypes: [], conclusionTokens: [],
        isEquality: false, isIff: false, isImplication: false, isExistential: false, isUniversal: false, known: false,
      }, inspectTopK)
      const reasonByName = new Map(selection.selected.map((item) => [item.candidate.declaration.name, item.selectionReason]))
      const diagnosticByName = new Map(selection.selected.map((item) => [item.candidate.declaration.name, item.diagnostic]))
      const toStoredDiagnostic = (diagnostic: typeof selection.selected[number]["diagnostic"]) => diagnostic ? ({
        channelRanks: { ...diagnostic.ranks },
        informationScore: diagnostic.informationScore,
        crossChannelStrength: diagnostic.crossChannelStrength,
        consensus: diagnostic.consensus,
        matchedTokens: diagnostic.matchedTokens,
        exclusionReason: diagnostic.exclusionReason,
      }) : undefined
      const top = selection.selected.map((item) => ({
        ...item.candidate,
        selectionReason: item.selectionReason,
        selectionDiagnostics: toStoredDiagnostic(item.diagnostic),
        stage1Rank: item.stage1Rank,
      }))
      header.candidates = header.candidates.map((item, index) => ({
        ...item,
        stage1Rank: index + 1,
        selectionReason: reasonByName.get(item.declaration.name),
        selectionDiagnostics: toStoredDiagnostic(diagnosticByName.get(item.declaration.name)),
      }))
      header.inspectSelectionStrategy = selection.strategy
      header.inspectSelectorVersion = selection.selectorVersion
      header.inspectionLimit = inspectTopK
      header.inspectedCandidates = top.map((item) => item.declaration.name)
      header.selectionReasons = Object.fromEntries(top.map((item) => [item.declaration.name, item.selectionReason!]))
      const expected = this.expectedFingerprint(stored?.manifest.leanVersion ?? null)
      const cache = readInspectionCache(this.workspaceRoot, expected.leanVersion, expected.mathlibRevision)
      const hits = new Set<string>()
      const missing: string[] = []
      const inspections: LeanDeclarationInspection[] = []
      for (const item of top) {
        const sourceHash = item.declaration.origin === "workspace" ? hashText(item.declaration.signature) : null
        const cached = lookupInspection(cache.file, item.declaration.name, sourceHash)
        if (cached) {
          hits.add(item.declaration.name)
          inspections.push(cached)
        } else {
          missing.push(item.declaration.name)
        }
      }
      if (missing.length) {
        const fresh = await this.leanAdapter.inspectDeclarations(missing, { workspaceRoot: this.workspaceRoot }, {
          timeoutMs: config.inspectionTimeoutMs,
          extraImports: existsSync(join(this.workspaceRoot, "formal", "MathosFormal.lean")) ? ["MathosFormal"] : [],
        })
        if (fresh.failed || fresh.timedOut) {
          return {
            ...header,
            candidates: header.candidates.slice(0, request.maxPremises ?? config.maxPremises),
            enrichment: "LEAN_ENRICHMENT_FAILED",
            inspectedCount: 0,
            cacheHits: hits.size,
            cacheMisses: missing.length,
          }
        }
        for (const inspection of fresh.inspections) {
          const source = top.find((item) => item.declaration.name === inspection.name)
          const sourceHash = source?.declaration.origin === "workspace" ? hashText(source.declaration.signature) : null
          storeInspection(cache.file, inspection.name, inspection, sourceHash)
          inspections.push(inspection)
        }
        writeInspectionCache(this.workspaceRoot, cache.file)
      }
      const enriched = applyLeanEnrichment(header, inspections, request, hits)
      return {
        ...enriched,
        cacheHits: hits.size,
        cacheMisses: missing.length,
        candidatePoolSize: header.candidates.length,
        inspectedCount: inspections.length,
      }
    } catch {
      return {
        ...header,
        candidates: header.candidates.slice(0, request.maxPremises ?? config.maxPremises),
        enrichment: "LEAN_ENRICHMENT_FAILED",
      }
    }
  }
}

function dedupe(items: LeanDeclaration[]): LeanDeclaration[] {
  const map = new Map<string, LeanDeclaration>()
  for (const item of items) {
    const key = `${item.origin}:${item.name}`
    const prev = map.get(key)
    if (!prev || (item.claimStatus === "KERNEL_VERIFIED" && prev.claimStatus !== "KERNEL_VERIFIED")) {
      map.set(key, item)
    }
  }
  return [...map.values()]
}

export function writeRetrievalLog(workspaceRoot: string, payload: unknown): void {
  if (!process.env.MATHOS_RETRIEVAL_LOG && !process.env.MATHOS_DEBUG) return
  const dir = join(workspaceRoot, ".mathos", "logs")
  mkdirSync(dir, { recursive: true })
  const line = `${JSON.stringify({ at: new Date().toISOString(), payload })}\n`
  const file = join(dir, "retrieval.jsonl")
  writeFileSync(file, existsSync(file) ? `${readFileSync(file, "utf8")}${line}` : line, "utf8")
}

export { resolveRetrievalConfig }

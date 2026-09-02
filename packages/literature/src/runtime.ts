import type { LiteratureProvider, LiteratureQuery, LiteratureSearchResult, SourceMetadata } from "./index.ts"
import { LiteratureCache } from "./cache.ts"
import { mergeLiteratureResults, type CanonicalLiteratureResult } from "./dedupe.ts"
import { LiteratureProviderRegistry } from "./registry.ts"
import { OpenAlexLiteratureProvider } from "./providers/openalex.ts"
import { CrossrefLiteratureProvider } from "./providers/crossref.ts"
import { ArxivLiteratureProvider } from "./providers/arxiv.ts"
export interface LiteratureProviderHealth { name: string; state: "VERIFIED" | "UNAVAILABLE" | "OFFLINE_CACHE" | "OFFLINE_MISS"; detail: string }
export interface LiteratureRuntimeReport { state: "VERIFIED" | "PARTIAL" | "UNAVAILABLE" | "OFFLINE_CACHE" | "OFFLINE_MISS"; results: CanonicalLiteratureResult[]; providers: LiteratureProviderHealth[] }
export class LiteratureRuntime {
  constructor(private readonly registry: LiteratureProviderRegistry, private readonly cache: LiteratureCache, private readonly ttlMs = 15 * 60_000) {}
  async search(query: LiteratureQuery, options: { offline?: boolean } = {}): Promise<LiteratureRuntimeReport> {
    const providers = this.registry.list()
    if (options.offline) { const health: LiteratureProviderHealth[] = [], results: LiteratureSearchResult[] = []; for (const provider of providers) { const cached = this.cache.getForQuery(provider.name, query); if (cached) { results.push(...cached); health.push({ name: provider.name, state: "OFFLINE_CACHE", detail: `${cached.length} cached result(s)` }) } else health.push({ name: provider.name, state: "OFFLINE_MISS", detail: "no unexpired cached result" }) } return { state: results.length ? "OFFLINE_CACHE" : "OFFLINE_MISS", results: mergeLiteratureResults(results), providers: health } }
    const settled = await Promise.all(providers.map(async provider => { try { const results = (await provider.search(query)).slice(0, query.maxResults); this.cache.setForQuery(provider.name, query, results, this.ttlMs); return { health: { name: provider.name, state: "VERIFIED", detail: `${results.length} result(s)` } as LiteratureProviderHealth, results } } catch (error) { return { health: { name: provider.name, state: "UNAVAILABLE", detail: error instanceof Error ? error.message : String(error) } as LiteratureProviderHealth, results: [] as LiteratureSearchResult[] } } }))
    const health = settled.map(item => item.health).sort((a, b) => a.name.localeCompare(b.name)), successes = health.filter(item => item.state === "VERIFIED").length, results = mergeLiteratureResults(settled.flatMap(item => item.results)); return { state: successes === providers.length ? "VERIFIED" : successes > 0 ? "PARTIAL" : "UNAVAILABLE", results, providers: health }
  }
}
export class ProductionLiteratureProvider implements LiteratureProvider {
  readonly name = "aggregate"
  readonly providerNames: string[]
  lastReport: LiteratureRuntimeReport | null = null
  constructor(private readonly runtime: LiteratureRuntime, providerNames: string[], private readonly offline = false) { this.providerNames = [...providerNames].sort() }
  async search(query: LiteratureQuery): Promise<LiteratureSearchResult[]> { this.lastReport = await this.runtime.search(query, { offline: this.offline }); return this.lastReport.results.map(item => item.result) }
  async fetchMetadata(result: LiteratureSearchResult): Promise<SourceMetadata> { return { ...result, type: result.arxivId ? "PREPRINT" : "PAPER" } }
}
export function createProductionLiteratureProvider(options: { cachePath?: string; offline?: boolean; ttlMs?: number } = {}): ProductionLiteratureProvider {
  const registry = new LiteratureProviderRegistry(); registry.register(new ArxivLiteratureProvider({ offline: options.offline })); registry.register(new CrossrefLiteratureProvider({ offline: options.offline })); registry.register(new OpenAlexLiteratureProvider({ offline: options.offline })); return new ProductionLiteratureProvider(new LiteratureRuntime(registry, new LiteratureCache({ path: options.cachePath }), options.ttlMs), registry.list().map(provider => provider.name), options.offline)
}

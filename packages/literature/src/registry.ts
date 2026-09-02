import type { LiteratureProvider } from "./index.ts"
export class LiteratureProviderRegistry {
  private readonly providers = new Map<string, LiteratureProvider>()
  constructor(private readonly options: { allowTestProviders?: boolean } = {}) {}
  register(provider: LiteratureProvider): LiteratureProvider { if (provider.name === "fake" && !this.options.allowTestProviders) throw new Error("TEST_PROVIDER_FORBIDDEN"); if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(provider.name)) throw new Error("LITERATURE_PROVIDER_NAME_INVALID"); if (this.providers.has(provider.name)) throw new Error(`LITERATURE_PROVIDER_EXISTS: ${provider.name}`); this.providers.set(provider.name, provider); return provider }
  get(name: string): LiteratureProvider | null { return this.providers.get(name) ?? null }
  list(): LiteratureProvider[] { return [...this.providers.values()].sort((a, b) => a.name.localeCompare(b.name)) }
}

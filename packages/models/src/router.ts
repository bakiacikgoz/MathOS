import type { ModelRole } from "./types.ts"
import type { ModelProvider } from "./types.ts"
import type { ModelProfile } from "./profile.ts"
import { ModelProfileRegistry, ProviderProfileRegistry } from "./registry.ts"
import type { ModelProfileV2 } from "./profiles/types.ts"
import { providerCatalog } from "./catalog/catalog.ts"
import { evaluateProviderPolicy } from "./catalog/terms-policy.ts"
import type { ProviderBillingClass, ProviderConnectionState } from "./catalog/types.ts"
import { selectFallbackRoute, type ModelRouteDecision } from "./routing/fallback.ts"
export interface ModelFallbackConfig { profiles: string[]; allowBillingTransition?: boolean; allowLocalToRemoteTransition?: boolean }
export interface ModelRouteMetadata { billingClass: ProviderBillingClass; remote: boolean; connectionState?: ProviderConnectionState }
export interface ModelRouteConfig { defaultProfile?: string; roles?: Partial<Record<ModelRole, string>>; fallback?: Partial<Record<ModelRole, ModelFallbackConfig>>; metadata?: Record<string, ModelRouteMetadata> }
export class ModelRouter {
  constructor(private readonly registry: ModelProfileRegistry, private readonly config: ModelRouteConfig) {}
  resolve(role: ModelRole): ModelProfile { const decision = this.resolveWithState(role); if (!decision.selected) throw new Error(`MODEL_ROUTE_${decision.state}: ${role}`); return decision.selected.value }
  resolveWithState(role: ModelRole): ModelRouteDecision<ModelProfile> {
    const primaryId = this.config.roles?.[role] ?? this.config.defaultProfile
    if (!primaryId) throw new Error(`MODEL_ROUTE_BLOCKED: ${role}`)
    const fallback = this.config.fallback?.[role]
    const ids = fallback ? [primaryId, ...fallback.profiles.filter(id => id !== primaryId)] : [primaryId]
    const candidates = ids.map(id => {
      const profile = this.registry.get(id)
      if (!profile) throw new Error(`MODEL_PROFILE_NOT_FOUND: ${id}`)
      const metadata = this.config.metadata?.[id]
      return { profileId: id, value: profile, billingClass: metadata?.billingClass ?? (profile.remote ? "unknown" : "local"), remote: metadata?.remote ?? profile.remote, connectionState: metadata?.connectionState }
    })
    return selectFallbackRoute(candidates, { allowBillingTransition: fallback?.allowBillingTransition ?? false, allowLocalToRemoteTransition: fallback?.allowLocalToRemoteTransition ?? false })
  }
}

/** Routes persisted v2 provider profiles without weakening role or provider policy boundaries. */
export class ProviderProfileRouter {
  constructor(private readonly registry: ProviderProfileRegistry, private readonly config: ModelRouteConfig) {}

  resolve(role: ModelRole): ModelProfileV2 {
    const decision = this.resolveWithState(role)
    if (!decision.selected) throw new Error(`MODEL_ROUTE_${decision.state}: ${role}`)
    return decision.selected.value
  }

  resolveWithState(role: ModelRole): ModelRouteDecision<ModelProfileV2> {
    const primaryId = this.config.roles?.[role] ?? this.config.defaultProfile
    if (!primaryId) throw new Error(`MODEL_ROUTE_BLOCKED: ${role}`)
    const fallback = this.config.fallback?.[role]
    const ids = fallback ? [primaryId, ...fallback.profiles.filter(id => id !== primaryId)] : [primaryId]
    const candidates = ids.map(id => {
      const profile = this.registry.get(id)
      if (!profile) throw new Error(`MODEL_PROFILE_NOT_FOUND: ${id}`)
      const descriptor = providerCatalog.get(profile.descriptorId)
      if (!descriptor) throw new Error(`PROVIDER_DESCRIPTOR_NOT_FOUND: ${profile.descriptorId}`)
      const policy = evaluateProviderPolicy(descriptor.id)
      const connectionState: ProviderConnectionState = !profile.enabled
        ? "BLOCKED"
        : !profile.allowedRoles.includes(role)
          ? "BLOCKED"
          : !policy.allowed
            ? policy.code === "PROVIDER_RETIRED" ? "RETIRED" : "TERMS_RESTRICTED"
            : this.config.metadata?.[id]?.connectionState ?? "CONFIGURED"
      return {
        profileId: id,
        value: profile,
        billingClass: this.config.metadata?.[id]?.billingClass ?? descriptor.billingClass,
        remote: this.config.metadata?.[id]?.remote ?? descriptor.remote,
        connectionState,
      }
    })
    return selectFallbackRoute(candidates, {
      allowBillingTransition: fallback?.allowBillingTransition ?? false,
      allowLocalToRemoteTransition: fallback?.allowLocalToRemoteTransition ?? false,
    })
  }
}

export interface ConnectedModelRoutes {
  providers: Partial<Record<ModelRole, ModelProvider>>
  close(): Promise<void>
}

type ManagedModelProvider = ModelProvider & { connect?: () => Promise<unknown>; close?: () => Promise<void> }

/** Instantiates one managed client per selected profile and shares it across that profile's roles. */
export async function connectModelRoutes(
  router: ProviderProfileRouter,
  roles: readonly ModelRole[],
  create: (profile: ModelProfileV2) => Promise<ManagedModelProvider>,
): Promise<ConnectedModelRoutes> {
  const providers: Partial<Record<ModelRole, ModelProvider>> = {}
  const clients = new Map<string, ManagedModelProvider>()
  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    const results = await Promise.allSettled([...clients.values()].reverse().map(client => client.close?.()))
    const failed = results.find(result => result.status === "rejected")
    if (failed?.status === "rejected") throw failed.reason
  }
  try {
    for (const role of roles) {
      const profile = router.resolve(role)
      let provider = clients.get(profile.id)
      if (!provider) {
        provider = await create(profile)
        clients.set(profile.id, provider)
        await provider.connect?.()
      }
      providers[role] = provider
    }
    return { providers, close }
  } catch (error) {
    await close().catch(() => undefined)
    throw error
  }
}

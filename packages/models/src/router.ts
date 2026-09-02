import type { ModelRole } from "./types.ts"
import type { ModelProfile } from "./profile.ts"
import { ModelProfileRegistry } from "./registry.ts"
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

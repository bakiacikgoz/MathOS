import type { ModelRole } from "./types.ts"
import type { ModelProfile } from "./profile.ts"
import { ModelProfileRegistry } from "./registry.ts"
export interface ModelRouteConfig { defaultProfile?: string; roles?: Partial<Record<ModelRole, string>> }
export class ModelRouter {
  constructor(private readonly registry: ModelProfileRegistry, private readonly config: ModelRouteConfig) {}
  resolve(role: ModelRole): ModelProfile { const id = this.config.roles?.[role] ?? this.config.defaultProfile; if (!id) throw new Error(`MODEL_ROUTE_BLOCKED: ${role}`); const profile = this.registry.get(id); if (!profile) throw new Error(`MODEL_PROFILE_NOT_FOUND: ${id}`); return profile }
}

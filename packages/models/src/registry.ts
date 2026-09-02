import { validateModelProfile, type ModelProfile } from "./profile.ts"
import { validateModelProfileV2 } from "./profile.ts"
import type { ModelProfileV2 } from "./profiles/types.ts"
export class ModelProfileRegistry {
  private readonly profiles = new Map<string, ModelProfile>()
  constructor(initial: ModelProfile[] = []) { for (const profile of initial) this.add(profile) }
  add(profile: ModelProfile): ModelProfile { const validated = validateModelProfile(profile); if (this.profiles.has(validated.id)) throw new Error(`MODEL_PROFILE_EXISTS: ${validated.id}`); this.profiles.set(validated.id, validated); return validated }
  update(profile: ModelProfile): ModelProfile { const validated = validateModelProfile(profile); if (!this.profiles.has(validated.id)) throw new Error(`MODEL_PROFILE_NOT_FOUND: ${validated.id}`); this.profiles.set(validated.id, validated); return validated }
  remove(id: string): boolean { return this.profiles.delete(id) }
  get(id: string): ModelProfile | null { return this.profiles.get(id) ?? null }
  list(): ModelProfile[] { return [...this.profiles.values()].sort((a, b) => a.id.localeCompare(b.id)).map(profile => ({ ...profile })) }
}
export class ProviderProfileRegistry {
  private readonly profiles = new Map<string, ModelProfileV2>()
  constructor(initial: ModelProfileV2[] = []) { for (const profile of initial) this.add(profile) }
  add(profile: ModelProfileV2): ModelProfileV2 { const validated=validateModelProfileV2(profile);if(this.profiles.has(validated.id))throw new Error(`MODEL_PROFILE_EXISTS: ${validated.id}`);this.profiles.set(validated.id,validated);return structuredClone(validated) }
  update(profile: ModelProfileV2): ModelProfileV2 { const validated=validateModelProfileV2(profile);if(!this.profiles.has(validated.id))throw new Error(`MODEL_PROFILE_NOT_FOUND: ${validated.id}`);this.profiles.set(validated.id,validated);return structuredClone(validated) }
  remove(id:string):boolean{return this.profiles.delete(id)}
  get(id:string):ModelProfileV2|null{const profile=this.profiles.get(id);return profile?structuredClone(profile):null}
  list():ModelProfileV2[]{return [...this.profiles.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(profile=>structuredClone(profile))}
}

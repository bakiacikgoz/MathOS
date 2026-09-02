import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { parseModelProfiles } from "../profile.ts"
import { migrateModelProfileV1 } from "./migrate-v1.ts"
import { parseModelProfilesV2, serializeModelProfilesV2 } from "../profile.ts"
import type { ModelProfileV2 } from "./types.ts"
export interface ModelProfileStoreLoad { profiles: ModelProfileV2[]; migrated: boolean; backupPath: string | null }
export function saveModelProfileStore(path: string, profiles: ModelProfileV2[]): void { const temporary = `${path}.${process.pid}.tmp`; writeFileSync(temporary, serializeModelProfilesV2(profiles), { encoding: "utf8", mode: 0o600 }); renameSync(temporary, path); try { chmodSync(path, 0o600) } catch {} }
export function loadModelProfileStore(path: string, options: { now?: () => string } = {}): ModelProfileStoreLoad {
  if (!existsSync(path)) return { profiles: [], migrated: false, backupPath: null }
  const text = readFileSync(path, "utf8"), parsed = JSON.parse(text) as { schemaVersion?: string }
  if (parsed.schemaVersion === "mathos.model-profiles.v2") return { profiles: parseModelProfilesV2(text), migrated: false, backupPath: null }
  const timestamp = (options.now ?? (() => new Date().toISOString()))(), legacy = parseModelProfiles(text), profiles = legacy.map(profile => migrateModelProfileV1(profile, timestamp))
  const backupPath = `${path}.v1.${timestamp.replace(/[:.]/g, "-")}.bak`; writeFileSync(backupPath, `${JSON.stringify({ schemaVersion: "mathos-model-profiles-v1", profiles: legacy }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  saveModelProfileStore(path, profiles); return { profiles, migrated: true, backupPath }
}

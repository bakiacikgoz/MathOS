import { run, runJson } from "./bridge.ts"
import { invalidate, useQuery } from "./query.ts"
import { providerKeys } from "./providers.ts"

// privacy.allow_remote_models: cloud models only run when this is on (it is off by default).
// Sources: "default" | "user" | "workspace" | "env" — a workspace or env value wins over the app's setting.
export interface RemoteModelsSetting { value: boolean; source: string }
const KEY = `${providerKeys.all}privacy`
export const useRemoteModels = (root: string) => useQuery(KEY, () => runJson<RemoteModelsSetting>(root, ["config", "get", "privacy.allow_remote_models"]))

/** Writes the setting to the user config and reports the effective value afterwards. */
export async function setRemoteModels(root: string, allowed: boolean): Promise<RemoteModelsSetting> {
  await run(root, ["config", "set", "privacy.allow_remote_models", String(allowed)])
  invalidate(providerKeys.all)
  return runJson<RemoteModelsSetting>(root, ["config", "get", "privacy.allow_remote_models"])
}

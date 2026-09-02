export type ModelPrivacyIndicator = "REMOTE_PROVIDER" | "LOCAL_PROVIDER"
export function assertModelPrivacy(profile: { remote: boolean }, privacy: { allowRemoteModels: boolean }): ModelPrivacyIndicator { if (profile.remote && !privacy.allowRemoteModels) throw new Error("REMOTE_MODEL_BLOCKED"); return profile.remote ? "REMOTE_PROVIDER" : "LOCAL_PROVIDER" }

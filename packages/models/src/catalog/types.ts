export type ProviderTransportKind = "openai-chat" | "openai-responses" | "anthropic-messages" | "ollama-chat" | "external-jsonrpc" | "external-acp" | "copilot-sdk"
export type ProviderAuthKind = "none" | "secret-ref" | "upstream-client" | "copilot-logged-in-user" | "application-default"
export type ProviderBillingClass = "subscription" | "payg" | "local" | "enterprise" | "unknown"
export type ProviderTermsPolicy = "STANDARD_API" | "OFFICIAL_CLIENT_BRIDGE" | "SCOPED_PLAN" | "TERMS_REVIEW_REQUIRED" | "REQUIRES_VENDOR_APPROVAL" | "PROHIBITED_THIRD_PARTY" | "RETIRED"
export type ProviderConnectionState = "UNCONFIGURED" | "CONFIGURED" | "LOGIN_REQUIRED" | "CONNECTED" | "DEGRADED" | "QUOTA_EXHAUSTED" | "CLIENT_MISSING" | "MODEL_UNAVAILABLE" | "TERMS_RESTRICTED" | "RETIRED" | "BLOCKED" | "ERROR"
export type ProviderWireProtocol = "openai-chat" | "openai-responses" | "anthropic-messages"
/** Multi-protocol gateways (for example OpenCode Zen/Go) serve different models over different wire protocols with one credential. */
export interface ProviderModelProtocol { model: string; protocol: ProviderWireProtocol | "unsupported" }
/** Identity a gateway requires from its clients: a truthful User-Agent and, optionally, a stable per-conversation session header. */
export interface ProviderRequestIdentity { userAgent: true; sessionHeader?: string }
export interface ProviderDescriptor {
  id: string; displayName: string; vendor: string; category: "subscription" | "api" | "plan" | "local" | "generic"; transport: ProviderTransportKind
  authKinds: ProviderAuthKind[]; billingClass: ProviderBillingClass; remote: boolean
  terms: { policy: ProviderTermsPolicy; summary: string; officialSources: string[]; lastReviewedAt: string; userOverrideAllowed: boolean; retiredAt?:string }
  endpointPresets: Array<{ id: string; baseUrl: string; region?: string; protocol: "openai" | "anthropic" | "ollama" | "external" }>
  externalClient?: { id: "codex" | "claude" | "copilot" | "gemini" | "qwen" | "agy"; executableNames: string[]; minimumVersion?: string; protocol: "jsonrpc" | "acp" | "sdk" | "cli-json"; ownsCredentials: boolean }
  modelDiscovery: { kind: "openai-models" | "ollama-tags"; path: string } | { kind: "sdk" | "external-client" | "static" | "manual" }
  defaultModels: string[]; truthfulClientIdentityRequired: boolean
  modelProtocols?: ProviderModelProtocol[]; requestIdentity?: ProviderRequestIdentity
  supportedPlatforms: Array<"win32-x64" | "darwin-arm64" | "darwin-x64" | "linux-x64" | "linux-arm64">
}

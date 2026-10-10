import { homedir } from "node:os"
import { join } from "node:path"
import { resolveRuntimeLayout } from "@mathos/shared"
import {
  ProviderProfileRegistry,
  ProviderProfileRouter,
  connectModelRoutes,
  createProviderFromProfile,
  createSecretStore,
  loadConfigFiles,
  loadModelProfileStore,
  providerCatalog,
  type ConnectedModelRoutes,
  type ModelProfileV2,
  type ModelProvider,
  type ModelRole,
  type ProviderFactoryOptions,
} from "@mathos/models"
import { clientProviderOptions, codexOptions } from "../../../scripts/providers/live-smoke.ts"

function runtimePaths(workspaceRoot: string) {
  const layout = resolveRuntimeLayout({ executablePath: process.execPath, platform: process.platform, home: homedir(), env: process.env })
  return { configPath: join(layout.userConfigRoot, "config.toml"), profilesPath: join(layout.userConfigRoot, "model-profiles.json"), workspaceRoot }
}

export function hasConfiguredModelProfiles(workspaceRoot: string): boolean {
  const roles = configuredModelRoleAssignments(workspaceRoot)
  const paths = runtimePaths(workspaceRoot)
  const loaded = loadConfigFiles({ userPath: paths.configPath, workspaceRoot })
  return Boolean(loaded.config.model.default_profile || Object.keys(roles).length)
}

export function configuredModelRoleAssignments(workspaceRoot: string): Record<string, string> {
  const paths = runtimePaths(workspaceRoot)
  return loadConfigFiles({ userPath: paths.configPath, workspaceRoot }).config.model.roles
}

/**
 * Model routes for the given roles from the user's configuration. `profile` pins every role to one profile (the
 * assistant's model picker); privacy and billing rules still apply to it.
 */
export async function configuredModelProviders(workspaceRoot: string, roles: readonly ModelRole[], override: { profile?: string; model?: string } = {}): Promise<ConnectedModelRoutes | undefined> {
  const paths = runtimePaths(workspaceRoot)
  const loaded = loadConfigFiles({ userPath: paths.configPath, workspaceRoot })
  if (!override.profile && !loaded.config.model.default_profile && !Object.keys(loaded.config.model.roles).length) return undefined
  // A picked model applies to the profile that actually answers: the one named, else the role's route, else the default.
  const routed = roles.length === 1 ? (loaded.config.model.roles as Partial<Record<ModelRole, string>>)[roles[0]!] : undefined
  const profiles = withModel(loadModelProfileStore(paths.profilesPath).profiles, override.profile ?? (routed || loaded.config.model.default_profile), override.model)
  const registry = new ProviderProfileRegistry(profiles)
  if (override.profile && !registry.get(override.profile)) throw new Error(`MODEL_PROFILE_NOT_FOUND: ${override.profile}`)
  const metadata = Object.fromEntries(profiles.map(profile => {
    const descriptor = providerCatalog.get(profile.descriptorId)
    if (!descriptor) throw new Error(`PROVIDER_DESCRIPTOR_NOT_FOUND: ${profile.descriptorId}`)
    return [profile.id, { billingClass: descriptor.billingClass, remote: descriptor.remote, connectionState: descriptor.remote && !loaded.config.privacy.allow_remote_models ? "BLOCKED" as const : undefined }]
  }))
  const router = new ProviderProfileRouter(registry, {
    defaultProfile: override.profile ?? (loaded.config.model.default_profile || undefined),
    roles: override.profile ? {} : loaded.config.model.roles as Partial<Record<ModelRole, string>>,
    fallback: override.profile ? {} : Object.fromEntries(Object.entries(loaded.config.model.fallback).map(([role, fallback]) => [role, {
      profiles: fallback.profiles,
      allowBillingTransition: fallback.allow_billing_transition,
      allowLocalToRemoteTransition: fallback.allow_local_to_remote_transition,
    }])) as Partial<Record<ModelRole, { profiles: string[]; allowBillingTransition?: boolean; allowLocalToRemoteTransition?: boolean }>>,
    metadata,
  })
  const options: ProviderFactoryOptions = { secrets: createSecretStore(), live: true }
  let codex: Awaited<ReturnType<typeof codexOptions>> | undefined
  return connectModelRoutes(router, roles, async profile => {
    const profileOptions = { ...options }
    if (profile.descriptorId === "openai-codex-chatgpt") profileOptions.codex = codex ??= await codexOptions()
    else Object.assign(profileOptions, await clientProviderOptions(profile))
    return await createProviderFromProfile(profile, profileOptions) as ModelProvider & { connect?: () => Promise<unknown>; close?: () => Promise<void> }
  })
}

/** The profile with another model of its own provider, as picked for one conversation; only models the provider lists. */
export function withModel(profiles: ModelProfileV2[], profileId: string | undefined, model: string | undefined): ModelProfileV2[] {
  if (!model || !profileId) return profiles
  return profiles.map(profile => {
    if (profile.id !== profileId || profile.model === model) return profile
    const listed = providerCatalog.get(profile.descriptorId)?.defaultModels ?? []
    if (!listed.includes(model)) throw new Error(`MODEL_NOT_OFFERED: ${model} is not a model of ${profile.displayName}`)
    return { ...profile, model }
  })
}

type ModelRouteLoader = (roles: readonly ModelRole[]) => Promise<ConnectedModelRoutes | undefined>

export function createReloadingModelProviders(roles: readonly ModelRole[], load: ModelRouteLoader): ConnectedModelRoutes {
  const active = new Set<ConnectedModelRoutes>()
  const last = new Map<ModelRole, ModelProvider>()
  let closed = false
  const invoke = async <T>(role: ModelRole, call: (provider: ModelProvider) => Promise<T>): Promise<T> => {
    if (closed) throw new Error("MODEL_RUNTIME_CLOSED")
    const routes = await load([role])
    if (closed) {
      await routes?.close()
      throw new Error("MODEL_RUNTIME_CLOSED")
    }
    const provider = routes?.providers[role]
    if (!routes || !provider) throw new Error(`MODEL_ROUTE_UNAVAILABLE: ${role}`)
    active.add(routes)
    last.set(role, provider)
    try {
      return await call(provider)
    } finally {
      active.delete(routes)
      await routes.close()
    }
  }
  const providers = Object.fromEntries(roles.map(role => [role, {
    get id() { return last.get(role)?.id ?? `configured-${role}` },
    get model() { return last.get(role)?.model ?? "configured" },
    get capabilities() { return last.get(role)?.capabilities ?? { structuredOutput: true, toolCalling: false, reasoning: true, streaming: false, vision: false } },
    generate: (request) => invoke(role, provider => provider.generate({ ...request, role })),
    generateStructured: (request) => invoke(role, provider => provider.generateStructured({ ...request, role })),
  } satisfies ModelProvider])) as Partial<Record<ModelRole, ModelProvider>>
  return {
    providers,
    close: async () => {
      if (closed) return
      closed = true
      await Promise.allSettled([...active].map(routes => routes.close()))
      active.clear()
    },
  }
}

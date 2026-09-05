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
  type ModelProvider,
  type ModelRole,
  type ProviderFactoryOptions,
} from "@mathos/models"
import { codexOptions } from "../../../scripts/providers/live-smoke.ts"

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

export async function configuredModelProviders(workspaceRoot: string, roles: readonly ModelRole[]): Promise<ConnectedModelRoutes | undefined> {
  const paths = runtimePaths(workspaceRoot)
  const loaded = loadConfigFiles({ userPath: paths.configPath, workspaceRoot })
  if (!loaded.config.model.default_profile && !Object.keys(loaded.config.model.roles).length) return undefined
  const profiles = loadModelProfileStore(paths.profilesPath).profiles
  const registry = new ProviderProfileRegistry(profiles)
  const metadata = Object.fromEntries(profiles.map(profile => {
    const descriptor = providerCatalog.get(profile.descriptorId)
    if (!descriptor) throw new Error(`PROVIDER_DESCRIPTOR_NOT_FOUND: ${profile.descriptorId}`)
    return [profile.id, { billingClass: descriptor.billingClass, remote: descriptor.remote, connectionState: descriptor.remote && !loaded.config.privacy.allow_remote_models ? "BLOCKED" as const : undefined }]
  }))
  const router = new ProviderProfileRouter(registry, {
    defaultProfile: loaded.config.model.default_profile || undefined,
    roles: loaded.config.model.roles as Partial<Record<ModelRole, string>>,
    fallback: Object.fromEntries(Object.entries(loaded.config.model.fallback).map(([role, fallback]) => [role, {
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
    return await createProviderFromProfile(profile, profileOptions) as ModelProvider & { connect?: () => Promise<unknown>; close?: () => Promise<void> }
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

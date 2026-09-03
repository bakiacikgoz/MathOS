import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

export interface MathOSConfig {
  model: { default_profile: string; roles: Record<string, string>; fallback: Record<string, { profiles: string[]; allow_billing_transition: boolean; allow_local_to_remote_transition: boolean }> }
  literature: { providers: string[]; offline: boolean }
  lean: { auto_setup: boolean }
  atlas: { open_browser: boolean }
  privacy: { allow_remote_models: boolean; allow_remote_literature: boolean }
}

export type ConfigScalar = string | boolean | string[]
export interface LoadedMathOSConfig { config: MathOSConfig; sources: Record<string, "default" | "user" | "workspace" | "env" | "cli"> }

const DEFAULTS: MathOSConfig = {
  model: { default_profile: "", roles: {}, fallback: {} }, literature: { providers: ["openalex", "crossref", "arxiv"], offline: false },
  lean: { auto_setup: false }, atlas: { open_browser: true }, privacy: { allow_remote_models: false, allow_remote_literature: true },
}
const FIXED = new Set(["model.default_profile", "literature.providers", "literature.offline", "lean.auto_setup", "atlas.open_browser", "privacy.allow_remote_models", "privacy.allow_remote_literature"])
const LEGACY = new Set(["project.name", "project.primary_language", "project.proof_assistant", "formalization.mode", "formalization.require_fidelity_review_for_main_theorem", "verification.forbid_sorry_for_verified", "verification.audit_axioms", "research.max_active_branches", "research.preserve_failed_branches", "privacy.classification", "model.provider", "model.model", "model.base_url", "model.alignment_model", "retrieval.max_premises", "retrieval.max_context_chars", "retrieval.candidate_pool", "retrieval.inspect_top_k", "retrieval.generation_per_channel", "retrieval.candidate_union_cap", "retrieval.inspection_timeout_ms", "retrieval.goal_aware", "retrieval.include_unverified_local"])
const SECRET = /(api[_-]?key|secret|token|password|authorization|credential)/i
const FALLBACK_KEY = /^model\.fallback\.[A-Za-z0-9_-]+\.(profiles|allow_billing_transition|allow_local_to_remote_transition)$/
function supported(path: string): boolean { return FIXED.has(path) || path.startsWith("model.roles.") || FALLBACK_KEY.test(path) }

function cloneDefaults(): MathOSConfig { return JSON.parse(JSON.stringify(DEFAULTS)) }
function parseValue(raw: string): ConfigScalar {
  const value = raw.trim()
  if (value === "true" || value === "false") return value === "true"
  if (value.startsWith("[") && value.endsWith("]")) return value.slice(1, -1).split(",").map(v => v.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean)
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1)
  throw new Error(`CONFIG_INVALID_VALUE: ${raw}`)
}
function parseEnvValue(raw: string): ConfigScalar {
  const value = raw.trim()
  if (value === "1" || value === "0") return value === "1"
  return parseValue(raw)
}
export function parseMathOSConfig(text: string): Record<string, ConfigScalar> {
  const values: Record<string, ConfigScalar> = {}; let section = ""
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim(); if (!line || line.startsWith("#")) continue
    const header = line.match(/^\[([^\]]+)\]$/); if (header) { section = header[1]!; continue }
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/); if (!match) throw new Error(`CONFIG_SYNTAX_ERROR: ${line}`)
    const key = `${section}.${match[1]}`.replace(/^\./, "")
    if (SECRET.test(key)) throw new Error(`CONFIG_SECRET_FORBIDDEN: ${key}`)
    if (LEGACY.has(key)) continue
    if (!supported(key)) throw new Error(`CONFIG_UNKNOWN_KEY: ${key}`)
    values[key] = parseValue(match[2]!)
  }
  return values
}
function assign(config: MathOSConfig, path: string, value: ConfigScalar): void {
  if (SECRET.test(path)) throw new Error(`CONFIG_SECRET_FORBIDDEN: ${path}`)
  const parts = path.split("."); let target: any = config
  for (const part of parts.slice(0, -1)) { target[part] ??= {}; target = target[part] }
  target[parts.at(-1)!] = value
}
function envOverrides(env: NodeJS.ProcessEnv): Record<string, ConfigScalar> {
  const result: Record<string, ConfigScalar> = {}
  if (env.MATHOS_MODEL_PROFILE) result["model.default_profile"] = env.MATHOS_MODEL_PROFILE
  if (env.MATHOS_ALLOW_REMOTE_MODELS) result["privacy.allow_remote_models"] = parseEnvValue(env.MATHOS_ALLOW_REMOTE_MODELS)
  if (env.MATHOS_ALLOW_REMOTE_LITERATURE) result["privacy.allow_remote_literature"] = parseEnvValue(env.MATHOS_ALLOW_REMOTE_LITERATURE)
  if (env.MATHOS_LITERATURE_OFFLINE) result["literature.offline"] = parseEnvValue(env.MATHOS_LITERATURE_OFFLINE)
  return result
}
export function loadMathOSConfig(options: { userToml?: string; workspaceToml?: string; env?: NodeJS.ProcessEnv; cli?: Record<string, ConfigScalar> } = {}): LoadedMathOSConfig {
  const config = cloneDefaults(), sources: LoadedMathOSConfig["sources"] = {}
  const apply = (values: Record<string, ConfigScalar>, source: LoadedMathOSConfig["sources"][string]) => { for (const [key, value] of Object.entries(values)) { if (!supported(key)) throw new Error(`CONFIG_UNKNOWN_KEY: ${key}`); assign(config, key, value); sources[key] = source } }
  for (const key of FIXED) sources[key] = "default"
  apply(options.userToml ? parseMathOSConfig(options.userToml) : {}, "user")
  apply(options.workspaceToml ? parseMathOSConfig(options.workspaceToml) : {}, "workspace")
  apply(envOverrides(options.env ?? process.env), "env"); apply(options.cli ?? {}, "cli")
  return { config, sources }
}
export function loadConfigFiles(options: { userPath: string; workspaceRoot?: string; env?: NodeJS.ProcessEnv; cli?: Record<string, ConfigScalar> }): LoadedMathOSConfig {
  return loadMathOSConfig({ userToml: existsSync(options.userPath) ? readFileSync(options.userPath, "utf8") : "", workspaceToml: options.workspaceRoot && existsSync(join(options.workspaceRoot, "mathos.toml")) ? readFileSync(join(options.workspaceRoot, "mathos.toml"), "utf8") : "", env: options.env, cli: options.cli })
}
export function serializeWorkspaceConfig(path: string, value: ConfigScalar): string {
  if (SECRET.test(path)) throw new Error(`CONFIG_SECRET_FORBIDDEN: ${path}`)
  if (!supported(path)) throw new Error(`CONFIG_UNKNOWN_KEY: ${path}`)
  const parts = path.split("."), key = parts.pop()!, encoded = Array.isArray(value) ? `[${value.map(v => JSON.stringify(v)).join(", ")}]` : typeof value === "string" ? JSON.stringify(value) : String(value)
  return `[${parts.join(".")}]\n${key} = ${encoded}\n`
}
export function serializeConfigValues(values: Record<string, ConfigScalar>): string {
  const sections = new Map<string, Array<[string, ConfigScalar]>>()
  for (const [path, value] of Object.entries(values).sort(([a], [b]) => a.localeCompare(b))) {
    if (SECRET.test(path)) throw new Error(`CONFIG_SECRET_FORBIDDEN: ${path}`)
    if (!supported(path)) throw new Error(`CONFIG_UNKNOWN_KEY: ${path}`)
    const parts = path.split("."), key = parts.pop()!, section = parts.join(".")
    const rows = sections.get(section) ?? []; rows.push([key, value]); sections.set(section, rows)
  }
  return [...sections].map(([section, rows]) => `[${section}]\n${rows.map(([key, value]) => `${key} = ${Array.isArray(value) ? `[${value.map(v => JSON.stringify(v)).join(", ")}]` : typeof value === "string" ? JSON.stringify(value) : String(value)}`).join("\n")}\n`).join("\n")
}

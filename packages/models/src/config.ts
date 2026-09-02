import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_BASE_URL, DEFAULT_PROVIDER, type ModelConfig } from "./types.ts"

function parseQuoted(value: string): string {
  const trimmed = value.trim()
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function parseTomlSection(text: string, section: string): Record<string, string> {
  const lines = text.split(/\r?\n/)
  const result: Record<string, string> = {}
  let inSection = false
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    if (line.startsWith("[") && line.endsWith("]")) {
      inSection = line.slice(1, -1).trim() === section
      continue
    }
    if (!inSection) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const value = parseQuoted(line.slice(eq + 1))
    result[key] = value
  }
  return result
}

export function resolveModelConfig(options: {
  workspaceRoot?: string
  env?: NodeJS.ProcessEnv
  tomlText?: string
} = {}): ModelConfig {
  const env = options.env ?? process.env
  let toml: Record<string, string> = {}
  if (options.tomlText !== undefined) {
    toml = parseTomlSection(options.tomlText, "model")
  } else if (options.workspaceRoot) {
    const path = join(options.workspaceRoot, "mathos.toml")
    if (existsSync(path)) {
      toml = parseTomlSection(readFileSync(path, "utf8"), "model")
    }
  }

  const envModel = env.MATHOS_MODEL?.trim() ?? ""
  const envUrl = env.MATHOS_BASE_URL?.trim() ?? ""
  const envKey = env.MATHOS_API_KEY?.trim() ?? ""
  const tomlModel = toml.model?.trim() ?? ""
  const tomlUrl = toml.base_url?.trim() ?? ""
  const tomlProvider = toml.provider?.trim() ?? ""

  return {
    provider: env.MATHOS_PROVIDER?.trim() || tomlProvider || DEFAULT_PROVIDER,
    model: envModel || tomlModel,
    baseUrl: (envUrl || tomlUrl || DEFAULT_BASE_URL).replace(/\/$/, ""),
    apiKey: envKey,
    source: {
      model: envModel ? "env" : tomlModel ? "toml" : "default",
      baseUrl: envUrl ? "env" : tomlUrl ? "toml" : "default",
      apiKey: envKey ? "env" : "missing",
    },
    roles:{alignment:env.MATHOS_ALIGNMENT_MODEL?.trim()||toml.alignment_model?.trim()||undefined},
  }
}

export function isModelReady(config: ModelConfig): boolean {
  return Boolean(config.apiKey && config.model && config.baseUrl)
}

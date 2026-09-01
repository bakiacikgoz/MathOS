import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_RETRIEVAL_CONFIG, type RetrievalConfig } from "./types.ts"

function parseSection(text: string, section: string): Record<string, string> {
  const result: Record<string, string> = {}
  let inSection = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    if (line.startsWith("[") && line.endsWith("]")) {
      inSection = line.slice(1, -1).trim() === section
      continue
    }
    if (!inSection) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    result[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "")
  }
  return result
}

export function resolveRetrievalConfig(workspaceRoot?: string): RetrievalConfig {
  const config = { ...DEFAULT_RETRIEVAL_CONFIG }
  if (!workspaceRoot) return config
  const path = join(workspaceRoot, "mathos.toml")
  if (!existsSync(path)) return config
  const toml = parseSection(readFileSync(path, "utf8"), "retrieval")
  if (toml.max_premises) config.maxPremises = Number(toml.max_premises) || config.maxPremises
  if (toml.max_context_chars) config.maxContextChars = Number(toml.max_context_chars) || config.maxContextChars
  if (toml.candidate_pool) config.candidatePool = Number(toml.candidate_pool) || config.candidatePool
  if (toml.inspect_top_k) config.inspectTopK = Number(toml.inspect_top_k) || config.inspectTopK
  if (toml.inspection_timeout_ms) config.inspectionTimeoutMs = Number(toml.inspection_timeout_ms) || config.inspectionTimeoutMs
  if (toml.generation_per_channel) config.generationPerChannel = Number(toml.generation_per_channel) || config.generationPerChannel
  if (toml.candidate_union_cap) config.candidateUnionCap = Number(toml.candidate_union_cap) || config.candidateUnionCap
  if (toml.goal_aware === "false") config.goalAware = false
  if (toml.include_unverified_local === "true") config.includeUnverifiedLocal = true
  return config
}

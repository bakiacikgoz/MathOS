import type { DoctorCheck } from "@mathos/domain"
import type { ModelConfig } from "./types.ts"

export async function modelDoctorChecks(
  config: ModelConfig,
  options: { fetchImpl?: typeof fetch; probe?: boolean } = {},
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [
    {
      name: "Model provider",
      status: config.provider ? "PASS" : "FAIL",
      detail: config.provider || "missing",
    },
    {
      name: "API key",
      status: config.apiKey ? "PASS" : "WARN",
      detail: config.apiKey ? "set" : "MATHOS_API_KEY is not set",
    },
    {
      name: "Model",
      status: config.model ? "PASS" : "WARN",
      detail: config.model || "MATHOS_MODEL is not set",
    },
  ]

  if (!options.probe) {
    checks.push({
      name: "Endpoint",
      status: config.baseUrl ? "PASS" : "FAIL",
      detail: config.baseUrl || "missing",
    })
    return checks
  }

  const fetchImpl = options.fetchImpl ?? fetch
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2000)
    const response = await fetchImpl(`${config.baseUrl}/models`, {
      method: "GET",
      headers: config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {},
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (response.status === 401 || response.status === 403) {
      checks.push({ name: "Endpoint", status: "FAIL", detail: "authentication failed" })
    } else if (response.ok || response.status === 404) {
      checks.push({ name: "Endpoint", status: "PASS", detail: "reachable" })
    } else {
      checks.push({ name: "Endpoint", status: "WARN", detail: `HTTP ${response.status}` })
    }
  } catch {
    checks.push({ name: "Endpoint", status: "WARN", detail: "unreachable / offline" })
  }
  return checks
}

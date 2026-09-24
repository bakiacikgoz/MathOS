export interface ExecResult { code: number; stdout: string; stderr: string; ms: number }
export interface HostInfo { running: boolean; version: string | null; source: string }

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export class MathosError extends Error {
  constructor(public code: string, message: string, public remediation?: string, public result?: ExecResult) { super(message) }
}

export async function exec(cwd: string, args: string[]): Promise<ExecResult> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core")
    try { return await invoke<ExecResult>("mathos_exec", { cwd, args }) }
    catch (error) { throw toError(String(error)) }
  }
  const response = await fetch("/__mathos/exec", { method: "POST", body: JSON.stringify({ cwd, args }) })
  if (!response.ok) throw new MathosError("DESKTOP_BRIDGE_UNAVAILABLE", await response.text())
  return await response.json() as ExecResult
}

/** Turns CLI stderr (plain text or `mathos.cli-error.v1` JSON) into a typed error. */
export function errorFromResult(result: ExecResult): MathosError {
  const text = result.stderr.trim() || result.stdout.trim()
  for (const line of text.split("\n")) {
    try {
      const value = JSON.parse(line) as { schemaVersion?: string; error?: { code?: string; message?: string }; remediation?: string }
      if (value.schemaVersion === "mathos.cli-error.v1" && value.error) return new MathosError(value.error.code ?? "MATHOS_ERROR", value.error.message ?? text, value.remediation, result)
    } catch {}
  }
  return toError(text || `exit ${result.code}`, result)
}

function toError(text: string, result?: ExecResult): MathosError {
  const match = /^([A-Z][A-Z0-9_]{3,}):\s*([\s\S]*)$/.exec(text.trim())
  return match ? new MathosError(match[1]!, match[2]!.trim() || match[1]!, undefined, result) : new MathosError("MATHOS_ERROR", text, undefined, result)
}

export async function run(cwd: string, args: string[], options: { allowNonZero?: boolean } = {}): Promise<ExecResult> {
  const result = await exec(cwd, args)
  if (result.code !== 0 && !options.allowNonZero) throw errorFromResult(result)
  return result
}

export async function runJson<T>(cwd: string, args: string[], options: { allowNonZero?: boolean } = {}): Promise<T> {
  const result = await exec(cwd, args.includes("--json") ? args : [...args, "--json"])
  if (result.code !== 0 && !(options.allowNonZero && result.stdout.trim().startsWith("{"))) throw errorFromResult(result)
  try { return JSON.parse(result.stdout) as T }
  catch { throw new MathosError("DESKTOP_JSON_INVALID", result.stdout.slice(0, 400), undefined, result) }
}

export async function hostInfo(): Promise<HostInfo | null> {
  if (!isTauri) return { running: true, version: null, source: "vite dev bridge" }
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<HostInfo>("host_info")
}

export async function restartHost(): Promise<void> {
  if (!isTauri) return
  const { invoke } = await import("@tauri-apps/api/core")
  await invoke("host_restart")
}

export async function pickFolder(title: string): Promise<string | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const picked = await open({ directory: true, multiple: false, title })
    return typeof picked === "string" ? picked : null
  }
  return window.prompt(title)?.trim() || null
}

export async function showWindow(): Promise<void> {
  if (!isTauri) return
  const { getCurrentWindow } = await import("@tauri-apps/api/window")
  await getCurrentWindow().show()
  await getCurrentWindow().setFocus()
}

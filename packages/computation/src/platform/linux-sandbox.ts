import { access } from "node:fs/promises"
import { UnavailableSandboxRuntime } from "./unavailable"
import type { SandboxCapability, SandboxedExecutionRequest, SandboxRuntime } from "../sandbox"

/** Detects candidate Linux isolation tools without advertising an unimplemented backend. */
export class LinuxSandboxRuntime implements SandboxRuntime {
 constructor(private readonly resolveBackend: () => Promise<string | null> = resolveLinuxSandboxBackend) {}
 async inspect(): Promise<SandboxCapability> {
  const detected = await this.resolveBackend()
  return {
   available: false,
   backend: detected,
   reason: detected ? "EXPERIMENT_BLOCKED_SANDBOX_BACKEND_UNIMPLEMENTED" : "EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE",
   networkIsolation: false,
  }
 }
 execute(request: SandboxedExecutionRequest) {
  return new UnavailableSandboxRuntime().execute(request)
 }
}

export async function resolveLinuxSandboxBackend(which: (name: string) => string | null = (name) => Bun.which(name) ?? null): Promise<string | null> {
 for (const name of ["bwrap", "firejail"]) {
  const found = which(name)
  if (found) return found
 }
 for (const path of ["/usr/bin/bwrap", "/usr/bin/firejail"]) {
  try { await access(path); return path } catch {}
 }
 return null
}

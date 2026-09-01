import { access } from "node:fs/promises"
import { UnavailableSandboxRuntime } from "./unavailable"
import type { SandboxCapability, SandboxedExecutionRequest, SandboxRuntime } from "../sandbox"

/** Detects candidate Linux isolation tools without advertising an unimplemented backend. */
export class LinuxSandboxRuntime implements SandboxRuntime {
 async inspect(): Promise<SandboxCapability> {
  const candidates = ["/usr/bin/bwrap", "/usr/bin/firejail"]
  let detected: string | null = null
  for (const path of candidates) {
   try { await access(path); detected = path; break } catch {}
  }
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

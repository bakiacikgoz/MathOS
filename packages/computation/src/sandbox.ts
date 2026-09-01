import type { ComputationalExecutionRequest, ComputationalExecutionResult } from "./index"
import { MacOSSandboxRuntime } from "./platform/macos-sandbox"
import { UnavailableSandboxRuntime } from "./platform/unavailable"
export interface SandboxCapability { available:boolean; backend:string|null; reason:string|null; networkIsolation:boolean }
export interface ExperimentSecurityReport { sandboxAvailable:boolean; sandboxBackend:string|null; networkAllowed:boolean; filesystemMode:string; timeoutMs:number; outputLimitBytes:number; blockedReason:string|null; executionPolicyVersion:string }
export type SandboxedExecutionRequest = ComputationalExecutionRequest
export interface SandboxRuntime { inspect():Promise<SandboxCapability>; execute(request:SandboxedExecutionRequest):Promise<ComputationalExecutionResult> }
export function blockedResult(request:SandboxedExecutionRequest, reason:string, backend:string|null = null):ComputationalExecutionResult {
 return {exitCode:null,timedOut:false,stdout:"",stderr:"",stdoutTruncated:false,stderrTruncated:false,durationMs:0,pid:null,blockedReason:reason,securityReport:{sandboxAvailable:false,sandboxBackend:backend,networkAllowed:false,filesystemMode:"PRIVATE_TEMP_ONLY",timeoutMs:request.timeoutMs,outputLimitBytes:request.maxOutputBytes,blockedReason:reason,executionPolicyVersion:"sandbox-v1"}}
}
export function createSandboxRuntime():SandboxRuntime { return process.platform === "darwin" ? new MacOSSandboxRuntime() : new UnavailableSandboxRuntime() }
export const inspectSandbox = () => createSandboxRuntime().inspect()
export const executeSandboxed = (request:SandboxedExecutionRequest) => createSandboxRuntime().execute(request)

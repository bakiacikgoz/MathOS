import { blockedResult, type SandboxRuntime, type SandboxedExecutionRequest } from "../sandbox"
export class UnavailableSandboxRuntime implements SandboxRuntime {
 async inspect() {return {available:false,backend:null,reason:"EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE",networkIsolation:false}}
 async execute(request:SandboxedExecutionRequest) {return blockedResult(request,"EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE")}
}

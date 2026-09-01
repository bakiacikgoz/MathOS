import { UnavailableSandboxRuntime } from "./unavailable"
/** Linux isolation is not implemented or advertised as supported. */
export class LinuxSandboxRuntime extends UnavailableSandboxRuntime {}

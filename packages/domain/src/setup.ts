export type SetupState = "NOT_STARTED" | "IN_PROGRESS" | "PARTIAL" | "READY"
export type SetupCapabilityState = "DETECTED" | "CONFIGURED" | "AVAILABLE" | "VERIFIED" | "BLOCKED" | "OPTIONAL_MISSING"
export interface SetupCapability { name: string; state: SetupCapabilityState; detail: string }
export interface SetupReport { state: SetupState; updatedAt: string; capabilities: SetupCapability[] }

import type { DoctorCheck, LeanDiagnostic } from "@mathos/domain"
import type { InspectDeclarationsOptions, InspectDeclarationsResult } from "./declaration.ts"

export interface LeanEnvironment {
  leanAvailable: boolean
  lakeAvailable: boolean
  leanVersion: string | null
  lakeVersion: string | null
  projectRoot: string | null
  lakefile: string | null
  toolchain: string | null
  mathlib: boolean
}

export interface LeanCheckResult {
  result: "ELABORATES" | "ERROR"
  diagnostics: LeanDiagnostic[]
  leanVersion: string | null
  toolchain: string | null
}

export interface LeanProofResult {
  result: "KERNEL_ACCEPTED" | "ERROR"
  diagnostics: LeanDiagnostic[]
  leanVersion: string | null
  toolchain: string | null
}

export interface LeanContext {
  workspaceRoot: string
  tmpDir?: string
  signal?: AbortSignal
}

export interface LeanSetupResult {
  created: boolean
  projectRoot: string
  toolchain: string
  mathlib: boolean
  cache: string
  build: "PASS" | "FAIL" | "SKIP"
  detail: string
}

export interface LeanAdapter {
  detect(workspaceRoot: string): Promise<LeanEnvironment>
  doctorChecks(env: LeanEnvironment): DoctorCheck[]
  probeCompile(workspaceRoot: string): Promise<{ ok: boolean; detail: string }>
  checkStatement(source: string, context: LeanContext): Promise<LeanCheckResult>
  checkProof(source: string, context: LeanContext): Promise<LeanProofResult>
  printAxioms(declarationName: string, source: string, context: LeanContext): Promise<string[]>
  setupProject(workspaceRoot: string): Promise<LeanSetupResult>
  inspectDeclarations(names: string[], context: LeanContext, options?: InspectDeclarationsOptions): Promise<InspectDeclarationsResult>
}

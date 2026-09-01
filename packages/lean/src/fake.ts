import type { DoctorCheck } from "@mathos/domain"
import type {
  LeanAdapter,
  LeanCheckResult,
  LeanContext,
  LeanEnvironment,
  LeanProofResult,
  LeanSetupResult,
} from "./types.ts"
import type { InspectDeclarationsOptions, InspectDeclarationsResult, LeanDeclarationInspection } from "./declaration.ts"
import { inspectLeanSignature, splitConclusion } from "./inspect.ts"

export class FakeLeanAdapter implements LeanAdapter {
  nextResult: LeanCheckResult = {
    result: "ELABORATES",
    diagnostics: [],
    leanVersion: "fake-4.33.1",
    toolchain: "leanprover/lean4:v4.33.1",
  }
  nextProof: LeanProofResult = {
    result: "KERNEL_ACCEPTED",
    diagnostics: [],
    leanVersion: "fake-4.33.1",
    toolchain: "leanprover/lean4:v4.33.1",
  }
  axioms: string[] = ["propext"]
  checkCalls = 0
  proofCalls = 0
  installed = true
  mathlib = true
  delayMs = 0
  onProofStart?: () => void

  async checkProof(_source: string, context: LeanContext): Promise<LeanProofResult> {
    this.proofCalls += 1
    this.onProofStart?.()
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    if (context.signal?.aborted) {
      return { result: "ERROR", diagnostics: [{ severity: "error", message: "LEAN_TIMEOUT" }], leanVersion: "fake-4.33.1", toolchain: "leanprover/lean4:v4.33.1" }
    }
    return this.nextProof
  }

  async detect(workspaceRoot: string): Promise<LeanEnvironment> {
    return {
      leanAvailable: this.installed,
      lakeAvailable: this.installed,
      leanVersion: this.installed ? "fake-4.33.1" : null,
      lakeVersion: this.installed ? "fake-lake" : null,
      projectRoot: workspaceRoot,
      lakefile: this.mathlib ? `${workspaceRoot}/formal/lakefile.toml` : null,
      toolchain: this.installed ? "leanprover/lean4:v4.33.1" : null,
      mathlib: this.mathlib,
    }
  }

  doctorChecks(env: LeanEnvironment): DoctorCheck[] {
    return [
      { name: "Lean", status: env.leanAvailable ? "PASS" : "WARN", detail: env.leanVersion ?? "not installed" },
      { name: "Lake", status: env.lakeAvailable ? "PASS" : "WARN", detail: env.lakeVersion ?? "not installed" },
      { name: "Lean project", status: env.projectRoot ? "PASS" : "WARN", detail: env.projectRoot ?? "none" },
      { name: "Mathlib", status: env.mathlib ? "PASS" : "WARN", detail: env.mathlib ? "detected" : "not detected" },
      { name: "Toolchain pinned", status: env.toolchain ? "PASS" : "WARN", detail: env.toolchain ?? "missing" },
    ]
  }

  async probeCompile(): Promise<{ ok: boolean; detail: string }> {
    return { ok: this.installed, detail: this.installed ? "compiled example : True" : "lean not installed" }
  }

  async checkStatement(_source: string, _context: LeanContext): Promise<LeanCheckResult> {
    this.checkCalls += 1
    return this.nextResult
  }

  async printAxioms(): Promise<string[]> {
    return this.axioms
  }

  inspectCalls = 0
  inspectFail = false
  inspectTimeout = false
  unknownNames = new Set<string>()
  inspectTypes = new Map<string, string>()

  async inspectDeclarations(names: string[], _context: LeanContext, _options?: InspectDeclarationsOptions): Promise<InspectDeclarationsResult> {
    this.inspectCalls += 1
    if (this.inspectTimeout) return { inspections: [], timedOut: true, failed: true, detail: "timeout" }
    if (this.inspectFail) return { inspections: [], timedOut: false, failed: true, detail: "parse failure" }
    const inspections: LeanDeclarationInspection[] = names.map((name) => {
      if (this.unknownNames.has(name)) {
        return {
          name,
          exists: false,
          constants: [],
          typeConstructors: [],
          diagnostics: [{ severity: "error", message: `unknown identifier '${name}'` }],
          elaborated: false,
        }
      }
      const type = this.inspectTypes.get(name) ?? `theorem ${name} : True`
      const inspected = inspectLeanSignature(name, type)
      const { conclusion } = splitConclusion(type)
      return {
        name,
        exists: true,
        type,
        normalizedType: type,
        namespace: name.includes(".") ? name.split(".")[0] : undefined,
        constants: inspected.constants,
        typeConstructors: inspected.typeConstructors,
        conclusion: conclusion ?? inspected.rawTarget,
        propositionShape: {
          equality: inspected.isEquality,
          iff: inspected.isIff,
          implication: inspected.isImplication,
          existential: inspected.isExistential,
          universal: inspected.isUniversal,
          inequality: inspected.operators.includes("le"),
        },
        diagnostics: [],
        elaborated: true,
      }
    })
    return { inspections, timedOut: false, failed: false }
  }

  async setupProject(workspaceRoot: string): Promise<LeanSetupResult> {
    return {
      created: false,
      projectRoot: `${workspaceRoot}/formal`,
      toolchain: "leanprover/lean4:v4.33.1",
      mathlib: true,
      cache: "ok",
      build: "PASS",
      detail: "fake setup",
    }
  }
}

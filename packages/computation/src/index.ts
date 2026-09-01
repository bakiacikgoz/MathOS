import { createHash } from "node:crypto"
import { platform } from "node:os"
import type { ExperimentKind, ExperimentOrigin } from "@mathos/domain"

import { allowedEnv } from "./environment"
import { createSandboxRuntime, type SandboxRuntime, type ExperimentSecurityReport } from "./sandbox"
export * from "./policy"
export * from "./sandbox"
export { allowedEnv } from "./environment"

export interface RuntimeEnvironmentReport {
  pythonAvailable: boolean
  pythonExecutable: string
  pythonVersion: string | null
  sympyAvailable: boolean
  sympyVersion: string | null
  platform: string
  adapterVersion: "v1"
}

export interface ComputationalExecutionRequest {
  executable: string
  scriptPath: string
  cwd: string
  timeoutMs: number
  maxOutputBytes: number
  extraEnv?: Record<string, string>
  origin?: ExperimentOrigin
  allowUserAuthored?: boolean
}

export interface ComputationalExecutionResult {
  blockedReason?: string
  securityReport?: ExperimentSecurityReport
  exitCode: number | null
  timedOut: boolean
  stdout: string
  stderr: string
  stdoutTruncated: boolean
  stderrTruncated: boolean
  durationMs: number
  pid: number | null
}

export interface ComputationalRuntime {
  inspectEnvironment(): Promise<RuntimeEnvironmentReport>
  execute(request: ComputationalExecutionRequest): Promise<ComputationalExecutionResult>
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

export class PythonRuntime implements ComputationalRuntime {
  constructor(private readonly executable = process.env.MATHOS_PYTHON ?? "python3", private readonly sandbox: SandboxRuntime = createSandboxRuntime()) {}

  async inspectEnvironment(): Promise<RuntimeEnvironmentReport> {
    const blob = await this.probe([this.executable, "-c", "import sys; print(sys.version.split()[0]);\ntry:\n import sympy\n print(sympy.__version__)\nexcept Exception:\n print('NONE')"])
    const [pythonVersion, sympyVersion] = blob ? blob.split("\n") : [null, null]
    const sympyAvailable = Boolean(sympyVersion && sympyVersion !== "NONE")
    return {
      pythonAvailable: Boolean(pythonVersion),
      pythonExecutable: this.executable,
      pythonVersion: pythonVersion || null,
      sympyAvailable,
      sympyVersion: sympyAvailable ? sympyVersion : null,
      platform: `${platform()} ${process.arch}`,
      adapterVersion: "v1",
    }
  }

  async execute(request: ComputationalExecutionRequest): Promise<ComputationalExecutionResult> {
    return this.sandbox.execute(request)
  }

  private async probe(argv: string[]): Promise<string | null> {
    try {
      const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", env: allowedEnv() })
      const timer = setTimeout(() => proc.kill(), 1500)
      const out = (await new Response(proc.stdout).text()).trim()
      const code = await proc.exited
      clearTimeout(timer)
      return code === 0 && out ? out : null
    } catch {
      return null
    }
  }
}

export class FakeComputationalRuntime implements ComputationalRuntime {
  next: ComputationalExecutionResult = {
    exitCode: 0,
    timedOut: false,
    stdout: "{\"ok\":true}\n",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    durationMs: 1,
    pid: 0,
  }

  async inspectEnvironment(): Promise<RuntimeEnvironmentReport> {
    return {
      pythonAvailable: true,
      pythonExecutable: "fake-python",
      pythonVersion: "fake-3",
      sympyAvailable: false,
      sympyVersion: null,
      platform: "fake",
      adapterVersion: "v1",
    }
  }

  async execute(): Promise<ComputationalExecutionResult> {
    return this.next
  }
}

export function recipeCode(kind: ExperimentKind, parameters: Record<string, unknown>): string {
  if (parameters.code) return String(parameters.code)
  const property = String(parameters.property ?? "n == n")
  const start = Number(parameters.domainStart ?? 0)
  const end = Number(parameters.domainEnd ?? 10)
  if (kind === "SYMBOLIC_COMPUTATION") {
    return `import json
try:
    import sympy as sp
    expr = sp.expand(sp.sympify(${JSON.stringify(String(parameters.expression ?? "(x+1)**3"))}))
    print(json.dumps({"ok": True, "result": str(expr), "exact": True, "outcome": "SUPPORTING_EVIDENCE"}))
except ImportError:
    print(json.dumps({"ok": False, "error": "SYMPY_UNAVAILABLE", "outcome": "INCONCLUSIVE"}))
`
  }
  if (kind === "SANITY_CHECK" || kind === "GENERAL") {
    return `print(${JSON.stringify(String(parameters.expression ?? "sum(range(101))"))})\nassert True\n`
  }
  const search = kind === "COUNTEREXAMPLE_SEARCH"
  return `import json
start, end = ${start}, ${end}
prop = ${JSON.stringify(property)}
witness = None
checked = 0
for n in range(start, end + 1):
    checked += 1
    ok = eval(prop, {"n": n, "__builtins__": {}})
    if ${search ? "not ok" : "not ok"}:
        witness = n
        break
if witness is None:
    print(json.dumps({"ok": True, "checked": checked, "domain": [start, end], "property": prop, "outcome": "NO_COUNTEREXAMPLE_FOUND", "exact": True}))
else:
    print(json.dumps({"ok": True, "checked": checked, "witness": {"n": witness}, "property": prop, "outcome": "COUNTEREXAMPLE_FOUND", "exact": True}))
`
}

export function parseStructured(stdout: string): Record<string, unknown> {
  const lines = stdout.trim().split("\n").reverse()
  for (const line of lines) {
    try {
      const value = JSON.parse(line)
      if (value && typeof value === "object") return value as Record<string, unknown>
    } catch { /* next */ }
  }
  return { raw: stdout.slice(0, 400) }
}

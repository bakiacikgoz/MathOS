import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, join, resolve } from "node:path"
import type { DoctorCheck, LeanDiagnostic } from "@mathos/domain"
import { PINNED_LEAN_TOOLCHAIN, PINNED_MATHLIB_REV } from "./pin.ts"
import type {
  LeanAdapter,
  LeanCheckResult,
  LeanContext,
  LeanEnvironment,
  LeanProofResult,
  LeanSetupResult,
} from "./types.ts"
import type { InspectDeclarationsOptions, InspectDeclarationsResult } from "./declaration.ts"
import { parseCheckOutput } from "./parse-check.ts"

function leanPath(): string {
  const elan = join(homedir(), ".elan", "bin")
  return `${elan}${delimiter}${process.env.PATH ?? ""}`
}

async function runAsync(cmd: string, args: string[], cwd?: string, signal?: AbortSignal, timeoutMs?: number): Promise<{ ok: boolean; out: string; timedOut: boolean }> {
  if (signal?.aborted) return { ok: false, out: "aborted", timedOut: true }
  try {
    const proc = Bun.spawn([cmd, ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PATH: leanPath() },
    })
    let timedOut = false
    const timer = timeoutMs ? setTimeout(() => {
      timedOut = true
      proc.kill()
    }, timeoutMs) : null
    const abort = () => proc.kill()
    signal?.addEventListener("abort", abort)
    try {
      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      const exitCode = await proc.exited
      return { ok: exitCode === 0 && !timedOut, out: `${stdout}${stderr}`.trim(), timedOut }
    } finally {
      if (timer) clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
    }
  } catch (error) {
    return { ok: false, out: error instanceof Error ? error.message : `${cmd} not found`, timedOut: false }
  }
}

function run(cmd: string, args: string[], cwd?: string, signal?: AbortSignal, timeoutMs?: number): { ok: boolean; out: string; timedOut: boolean } {
  try {
    const proc = Bun.spawnSync([cmd, ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PATH: leanPath() },
      timeout: timeoutMs,
    })
    if (signal?.aborted) {
      return { ok: false, out: "aborted", timedOut: false }
    }
    const out = `${new TextDecoder().decode(proc.stdout)}${new TextDecoder().decode(proc.stderr)}`.trim()
    const timedOut = proc.exitCode === null && /timeout/i.test(out || "")
    return { ok: proc.exitCode === 0, out, timedOut: timedOut || (timeoutMs !== undefined && proc.exitCode === null) }
  } catch (error) {
    return { ok: false, out: error instanceof Error ? error.message : `${cmd} not found`, timedOut: false }
  }
}

function findNamed(start: string, names: string[]): string | null {
  const formal = join(start, "formal")
  for (const base of [formal, start]) {
    for (const name of names) {
      if (existsSync(join(base, name))) return join(base, name)
    }
  }
  let current = start
  while (true) {
    for (const name of names) {
      if (existsSync(join(current, name))) return join(current, name)
    }
    const parent = join(current, "..")
    if (parent === current) return null
    current = parent
  }
}

export function wrapForCheck(source: string): string {
  const trimmed = source.trim()
  if (/:=\s*$/.test(trimmed) || /:=\s*by\b/.test(trimmed) || /:=\s*\S/.test(trimmed)) return trimmed
  return `${trimmed} := by\n  sorry\n`
}

export function withProjectImports(source: string, mathlib: boolean): string {
  if (!mathlib || /^\s*import\s+/m.test(source)) return source
  return `import Mathlib\n\n${source}`
}

export function parseLeanOutput(text: string): LeanDiagnostic[] {
  if (!text.trim()) return []
  return text
    .split("\n")
    .filter(Boolean)
    .filter((line) => !/^\s*$/.test(line))
    .map((line) => {
      const match = line.match(/:(\d+):(\d+):\s*(error|warning|info):\s*(.*)/i)
      if (!match) return { severity: "error" as const, message: line }
      return {
        severity: match[3]!.toLowerCase() as LeanDiagnostic["severity"],
        message: match[4] ?? line,
        line: Number(match[1]),
        column: Number(match[2]),
      }
    })
}

export function parseAxioms(text: string): string[] {
  const none = /does not depend on any axioms/i.test(text)
  if (none) return []
  const bracket = text.match(/depends on axioms:\s*\[([^\]]*)\]/i)
  if (bracket) {
    return bracket[1]!
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.includes("depends on axioms") && !line.startsWith("warning:"))
  return lines
}

export class NativeLeanAdapter implements LeanAdapter {
  async detect(workspaceRoot: string): Promise<LeanEnvironment> {
    const lean = run("lean", ["--version"])
    const lake = run("lake", ["--version"])
    const toolchainFile = findNamed(workspaceRoot, ["lean-toolchain"])
    const lakefile = findNamed(workspaceRoot, ["lakefile.toml", "lakefile.lean"])
    const projectRoot = toolchainFile ? resolve(toolchainFile, "..") : lakefile ? resolve(lakefile, "..") : null
    const toolchain = toolchainFile && existsSync(toolchainFile) ? readFileSync(toolchainFile, "utf8").trim() : null
    const mathlib =
      (lakefile && existsSync(lakefile) && /mathlib/i.test(readFileSync(lakefile, "utf8"))) ||
      Boolean(
        projectRoot &&
          existsSync(join(projectRoot, "lake-manifest.json")) &&
          /mathlib/i.test(readFileSync(join(projectRoot, "lake-manifest.json"), "utf8")),
      )

    return {
      leanAvailable: lean.ok,
      lakeAvailable: lake.ok,
      leanVersion: lean.ok ? lean.out.split("\n")[0] ?? lean.out : null,
      lakeVersion: lake.ok ? lake.out.split("\n")[0] ?? lake.out : null,
      projectRoot,
      lakefile,
      toolchain,
      mathlib,
    }
  }

  doctorChecks(env: LeanEnvironment): DoctorCheck[] {
    return [
      { name: "Lean", status: env.leanAvailable ? "PASS" : "WARN", detail: env.leanVersion ?? "not installed" },
      { name: "Lake", status: env.lakeAvailable ? "PASS" : "WARN", detail: env.lakeVersion ?? "not installed" },
      { name: "Lean project", status: env.projectRoot ? "PASS" : "WARN", detail: env.projectRoot ?? "no lean-toolchain / lakefile" },
      { name: "Mathlib", status: env.mathlib ? "PASS" : "WARN", detail: env.mathlib ? "detected" : "not detected" },
      {
        name: "Toolchain pinned",
        status: env.toolchain && !/^(stable|latest)$/i.test(env.toolchain) ? "PASS" : "WARN",
        detail: env.toolchain ?? "lean-toolchain missing",
      },
    ]
  }

  async probeCompile(workspaceRoot: string): Promise<{ ok: boolean; detail: string }> {
    const env = await this.detect(workspaceRoot)
    if (!env.leanAvailable) return { ok: false, detail: "lean not installed" }
    const tmp = join(workspaceRoot, ".mathos", "tmp")
    mkdirSync(tmp, { recursive: true })
    const file = join(tmp, "probe.lean")
    writeFileSync(file, "example : True := trivial\n", "utf8")
    try {
      const checked = env.projectRoot
        ? run("lake", ["env", "lean", file], env.projectRoot)
        : run("lean", [file])
      return { ok: checked.ok, detail: checked.ok ? "compiled example : True" : checked.out.slice(0, 200) }
    } finally {
      try {
        rmSync(file, { force: true })
      } catch {
        /* ignore */
      }
    }
  }

  async checkStatement(source: string, context: LeanContext): Promise<LeanCheckResult> {
    const env = await this.detect(context.workspaceRoot)
    if (!env.leanAvailable) {
      return {
        result: "ERROR",
        diagnostics: [{ severity: "error", message: "Lean is not installed." }],
        leanVersion: null,
        toolchain: env.toolchain,
      }
    }
    const checked = await this.runSource(wrapForCheck(source), context, env.projectRoot, env.mathlib)
    return {
      result: checked.ok ? "ELABORATES" : "ERROR",
      diagnostics: parseLeanOutput(checked.out),
      leanVersion: env.leanVersion,
      toolchain: env.toolchain,
    }
  }

  async checkProof(source: string, context: LeanContext): Promise<LeanProofResult> {
    const env = await this.detect(context.workspaceRoot)
    if (!env.leanAvailable) {
      return {
        result: "ERROR",
        diagnostics: [{ severity: "error", message: "Lean is not installed." }],
        leanVersion: null,
        toolchain: env.toolchain,
      }
    }
    const checked = await this.runSource(source, context, env.projectRoot, env.mathlib)
    return {
      result: checked.ok ? "KERNEL_ACCEPTED" : "ERROR",
      diagnostics: parseLeanOutput(checked.out),
      leanVersion: env.leanVersion,
      toolchain: env.toolchain,
    }
  }

  async printAxioms(declarationName: string, source: string, context: LeanContext): Promise<string[]> {
    const env = await this.detect(context.workspaceRoot)
    if (!env.leanAvailable) return []
    const body = `${source.trim()}\n\n#print axioms ${declarationName}\n`
    const checked = await this.runSource(body, context, env.projectRoot, env.mathlib)
    return parseAxioms(checked.out)
  }

  async setupProject(workspaceRoot: string): Promise<LeanSetupResult> {
    const existing = await this.detect(workspaceRoot)
    const projectRoot = existing.projectRoot ?? join(workspaceRoot, "formal")
    mkdirSync(projectRoot, { recursive: true })
    mkdirSync(join(projectRoot, "MathosFormal"), { recursive: true })
    mkdirSync(join(projectRoot, "Claims"), { recursive: true })

    let created = false
    const toolchainPath = join(projectRoot, "lean-toolchain")
    const lakefilePath = join(projectRoot, "lakefile.toml")
    if (!existsSync(toolchainPath)) {
      writeFileSync(toolchainPath, `${PINNED_LEAN_TOOLCHAIN}\n`, "utf8")
      created = true
    }
    if (!existsSync(lakefilePath) && !existsSync(join(projectRoot, "lakefile.lean"))) {
      writeFileSync(
        lakefilePath,
        `name = "mathosFormal"\nversion = "0.1.0"\ndefaultTargets = ["MathosFormal"]\n\n[[require]]\nname = "mathlib"\nscope = "leanprover-community"\nrev = "${PINNED_MATHLIB_REV}"\n\n[[lean_lib]]\nname = "MathosFormal"\n`,
        "utf8",
      )
      created = true
    }
    if (!existsSync(join(projectRoot, "MathosFormal.lean"))) {
      writeFileSync(join(projectRoot, "MathosFormal.lean"), "import MathosFormal.Smoke\n", "utf8")
      created = true
    }
    if (!existsSync(join(projectRoot, "MathosFormal", "Smoke.lean"))) {
      writeFileSync(
        join(projectRoot, "MathosFormal", "Smoke.lean"),
        "import Mathlib\n\ntheorem mathos_smoke (n : Nat) : n = n := by\n  rfl\n",
        "utf8",
      )
      created = true
    }

    const toolchain = readFileSync(toolchainPath, "utf8").trim()
    run("elan", ["toolchain", "install", toolchain])
    const updated = run("lake", ["update"], projectRoot)
    const cache = run("lake", ["exe", "cache", "get"], projectRoot)
    const build = run("lake", ["build"], projectRoot)
    const env = await this.detect(workspaceRoot)
    return {
      created,
      projectRoot,
      toolchain,
      mathlib: env.mathlib,
      cache: cache.ok ? "ok" : cache.out.slice(0, 160),
      build: build.ok ? "PASS" : "FAIL",
      detail: build.ok ? "lake build ok" : `${updated.out}\n${build.out}`.slice(0, 400),
    }
  }

  async inspectDeclarations(
    names: string[],
    context: LeanContext,
    options: InspectDeclarationsOptions = {},
  ): Promise<InspectDeclarationsResult> {
    const unique = [...new Set(names.filter(Boolean))]
    if (unique.length === 0) return { inspections: [], timedOut: false, failed: false }
    const env = await this.detect(context.workspaceRoot)
    if (!env.leanAvailable) {
      return { inspections: [], timedOut: false, failed: true, detail: "Lean is not installed." }
    }
    const imports = ["import Mathlib", ...(options.extraImports ?? []).map((item) => `import ${item}`)]
    const body = `${imports.join("\n")}\n\n${unique.map((name) => `#check ${name}`).join("\n")}\n`
    const timeoutMs = options.timeoutMs ?? 120_000
    const checked = await this.runSource(body, context, env.projectRoot, env.mathlib, timeoutMs)
    if (checked.timedOut) {
      return { inspections: [], timedOut: true, failed: true, detail: "inspection timeout" }
    }
    try {
      return {
        inspections: parseCheckOutput(unique, checked.out),
        timedOut: false,
        failed: false,
        detail: checked.ok ? undefined : checked.out.slice(0, 240),
      }
    } catch (error) {
      return {
        inspections: [],
        timedOut: false,
        failed: true,
        detail: error instanceof Error ? error.message : "parse failure",
      }
    }
  }

  private async runSource(
    source: string,
    context: LeanContext,
    projectRoot: string | null,
    mathlib: boolean,
    timeoutMs?: number,
  ): Promise<{ ok: boolean; out: string; timedOut: boolean }> {
    const tmp = context.tmpDir ?? join(context.workspaceRoot, ".mathos", "tmp")
    mkdirSync(tmp, { recursive: true })
    const file = join(tmp, `chk-${Date.now()}-${Math.random().toString(16).slice(2)}.lean`)
    writeFileSync(file, `${withProjectImports(source.trim(), mathlib)}\n`, "utf8")
    try {
      if (projectRoot) return await runAsync("lake", ["env", "lean", file], projectRoot, context.signal, timeoutMs)
      return await runAsync("lean", [file], undefined, context.signal, timeoutMs)
    } finally {
      try {
        rmSync(file, { force: true })
      } catch {
        /* ignore */
      }
    }
  }
}

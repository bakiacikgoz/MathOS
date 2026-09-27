import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { resolveRuntimeLayout } from "@mathos/shared"
import { FORMAL_PROJECT_DIR, MATHLIB_GIT_URL, PINNED_LEAN_TOOLCHAIN, PINNED_MATHLIB_REV } from "./pin.ts"

// Mathlib comes straight from its git repository rather than through the Reservoir index, which is one less
// service to reach (and the one most often blocked on locked-down networks).
const lakefile = (name: string, lib: string) => `name = "${name}"\nversion = "0.1.0"\ndefaultTargets = ["${lib}"]\n\n[[require]]\nname = "mathlib"\ngit = "${MATHLIB_GIT_URL}"\nrev = "${PINNED_MATHLIB_REV}"\n\n[[lean_lib]]\nname = "${lib}"\n`
const LEGACY_LAKEFILE = `name = "mathosFormal"\nversion = "0.1.0"\ndefaultTargets = ["MathosFormal"]\n\n[[require]]\nname = "mathlib"\nscope = "leanprover-community"\nrev = "${PINNED_MATHLIB_REV}"\n\n[[lean_lib]]\nname = "MathosFormal"\n`
const SMOKE = "import Mathlib\n\ntheorem mathos_smoke (n : Nat) : n = n := by\n  rfl\n"

/**
 * The shared Lean runtime: one Lake project with the pinned Lean and Mathlib, installed once per computer and used by
 * every workspace, so a new workspace can formalize at once instead of downloading Mathlib again. It is named after
 * the Mathlib pin, so a MathOS update that moves the pin installs beside the old one instead of breaking it.
 */
export function leanRuntimeRoot(env: Record<string, string | undefined> = process.env, home = homedir()): string {
  if (env.MATHOS_LEAN_RUNTIME) return env.MATHOS_LEAN_RUNTIME
  const layout = resolveRuntimeLayout({ platform: process.platform, home, executablePath: process.execPath, env })
  return join(layout.userDataRoot, "lean", `mathlib-${PINNED_MATHLIB_REV}`)
}

const hasLakefile = (projectRoot: string) => existsSync(join(projectRoot, "lakefile.toml")) || existsSync(join(projectRoot, "lakefile.lean"))
export const mathlibFetchedAt = (projectRoot: string) => existsSync(join(projectRoot, ".lake", "packages", "mathlib", "Mathlib.lean"))
export function mathlibBuiltAt(projectRoot: string): boolean {
  const build = join(projectRoot, ".lake", "packages", "mathlib", ".lake", "build", "lib")
  return existsSync(join(build, "lean", "Mathlib.olean")) || existsSync(join(build, "Mathlib.olean"))
}
/** A project Lean can run in with Mathlib: its Lakefile and a built Mathlib are both there. */
export const mathlibReadyAt = (projectRoot: string) => hasLakefile(projectRoot) && mathlibBuiltAt(projectRoot)

/** Writes the shared runtime's Lake project: the pinned toolchain, Mathlib, and a module that imports it as a check. */
export function writeRuntimeProject(runtimeRoot: string): void {
  mkdirSync(join(runtimeRoot, "MathosRuntime"), { recursive: true })
  const write = (path: string, content: string) => { if (!existsSync(path) || readFileSync(path, "utf8") !== content) writeFileSync(path, content, "utf8") }
  write(join(runtimeRoot, "lean-toolchain"), `${PINNED_LEAN_TOOLCHAIN}\n`)
  write(join(runtimeRoot, "lakefile.toml"), lakefile("mathosRuntime", "MathosRuntime"))
  write(join(runtimeRoot, "MathosRuntime.lean"), "import MathosRuntime.Smoke\n")
  write(join(runtimeRoot, "MathosRuntime", "Smoke.lean"), SMOKE)
}

/**
 * Writes the workspace's own Lean project (toolchain, lakefile with the pinned Mathlib, a smoke module) where missing.
 * It holds the workspace's Lean files; checking them uses the shared runtime's Mathlib, so nothing is downloaded here.
 * Older MathOS lakefiles are migrated; a lakefile the user wrote is left alone.
 */
export function writeFormalProject(workspaceRoot: string, existingRoot: string | null = null): { projectRoot: string; created: boolean; toolchainPath: string } {
  const projectRoot = existingRoot ?? join(workspaceRoot, FORMAL_PROJECT_DIR)
  mkdirSync(join(projectRoot, "MathosFormal"), { recursive: true })
  mkdirSync(join(projectRoot, "Claims"), { recursive: true })

  let created = false
  const create = (path: string, content: string) => { if (!existsSync(path)) { writeFileSync(path, content, "utf8"); created = true } }
  const toolchainPath = join(projectRoot, "lean-toolchain")
  const lakefilePath = join(projectRoot, "lakefile.toml")
  create(toolchainPath, `${PINNED_LEAN_TOOLCHAIN}\n`)
  if ((!existsSync(lakefilePath) && !existsSync(join(projectRoot, "lakefile.lean"))) || (existsSync(lakefilePath) && readFileSync(lakefilePath, "utf8") === LEGACY_LAKEFILE)) {
    writeFileSync(lakefilePath, lakefile("mathosFormal", "MathosFormal"), "utf8")
    created = true
  }
  create(join(projectRoot, "MathosFormal.lean"), "import MathosFormal.Smoke\n")
  create(join(projectRoot, "MathosFormal", "Smoke.lean"), SMOKE)
  return { projectRoot, created, toolchainPath }
}

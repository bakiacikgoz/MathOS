#!/usr/bin/env bun
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { isAbsolute, join, relative, resolve } from "node:path"

const root = resolve(import.meta.dir, "..")

function bundledLean(): string | null {
  const tools = join(root, ".tools")
  if (!existsSync(tools)) return null
  for (const directory of readdirSync(tools).filter((name) => name.startsWith("lean-")).sort()) {
    const executable = join(tools, directory, "bin", process.platform === "win32" ? "lean.exe" : "lean")
    if (existsSync(executable)) return executable
  }
  return null
}

const lean = process.env.MATHOS_LEAN_EXECUTABLE || Bun.which("lean") || bundledLean()
if (!lean) {
  console.log(JSON.stringify({ passed: false, reason: "LEAN_EXECUTABLE_MISSING" }))
  process.exit(1)
}

const workspace = mkdtempSync(join(tmpdir(), "mathos-lean-smoke-"))
try {
  const source = join(workspace, "Smoke.lean")
  writeFileSync(source, "theorem mathos_release_smoke : 1 + 1 = 2 := by\n  rfl\n", "utf8")
  const version = Bun.spawnSync([lean, "--version"], { stdout: "pipe", stderr: "pipe" })
  const compiled = Bun.spawnSync([lean, source], { cwd: workspace, stdout: "pipe", stderr: "pipe", timeout: 30_000 })
  const passed = version.exitCode === 0 && compiled.exitCode === 0
  console.log(JSON.stringify({
    passed,
    executable: isAbsolute(lean) && !relative(root, lean).startsWith("..") ? `<repo>/${relative(root, lean)}` : lean,
    version: new TextDecoder().decode(version.stdout).trim(),
    diagnostic: new TextDecoder().decode(compiled.stderr).trim().slice(0, 1_000),
  }))
  if (!passed) process.exitCode = 1
} finally {
  rmSync(workspace, { recursive: true, force: true })
}

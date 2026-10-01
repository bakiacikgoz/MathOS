import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve, sep } from "node:path"

const script = join(import.meta.dir, "check-tauri-compatibility.ts")
const fixtureRoots: string[] = []

function fixture(overrides: Record<string, string | null> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "mathos-tauri-compat-test-"))
  fixtureRoots.push(root)
  mkdirSync(join(root, "src-tauri"))
  const versions: Record<string, string | null> = {
    "@tauri-apps/api": "2.12.0",
    "@tauri-apps/cli": "2.12.0",
    "@tauri-apps/plugin-opener": "2.6.0",
    "@tauri-apps/plugin-dialog": "2.7.3",
    ...overrides,
  }
  writeFileSync(join(root, "package.json"), JSON.stringify({
    dependencies: {
      "@tauri-apps/api": "2.12.0",
      "@tauri-apps/plugin-opener": "2.6.0",
      "@tauri-apps/plugin-dialog": "2.7.3",
    },
    devDependencies: { "@tauri-apps/cli": "2.12.0" },
  }))
  writeFileSync(join(root, "src-tauri", "Cargo.lock"), [
    "[[package]]\nname = \"tauri\"\nversion = \"2.12.0\"",
    "[[package]]\nname = \"tauri-plugin-opener\"\nversion = \"2.6.0\"",
    "[[package]]\nname = \"tauri-plugin-dialog\"\nversion = \"2.7.3\"",
  ].join("\n\n"))
  for (const [name, version] of Object.entries(versions)) {
    if (version === null) continue
    const packageDir = join(root, "node_modules", name)
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, "package.json"), JSON.stringify({ name, version }))
  }
  return root
}

function run(root: string) {
  const result = Bun.spawnSync([process.execPath, script, "--root", root], { stdout: "pipe", stderr: "pipe" })
  return { exitCode: result.exitCode, stderr: new TextDecoder().decode(result.stderr), stdout: new TextDecoder().decode(result.stdout) }
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    const target = resolve(root)
    const tempRoot = resolve(tmpdir())
    if (!target.startsWith(`${tempRoot}${sep}`) || !basename(target).startsWith("mathos-tauri-compat-test-")) {
      throw new Error(`Unsafe test fixture cleanup: ${target}`)
    }
    rmSync(target, { recursive: true, force: true })
  }
})

test("a frozen compatible Tauri installation passes", () => {
  const result = run(fixture())
  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("Tauri package versions compatible")
})

test("an installed plugin version behind the Rust lock fails before build", () => {
  const result = run(fixture({ "@tauri-apps/plugin-opener": "2.5.5" }))
  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("tauri-plugin-opener 2.6.0")
  expect(result.stderr).toContain("@tauri-apps/plugin-opener 2.5.5")
})

test("a missing installed Tauri package fails closed", () => {
  const result = run(fixture({ "@tauri-apps/cli": null }))
  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("@tauri-apps/cli is not installed")
})

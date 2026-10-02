import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"

test("Windows PowerShell steps cannot hide an earlier failed native command", () => {
  const workflow = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/desktop-windows.yml", import.meta.url), "utf8")) as {
    jobs: { build: { steps: Array<{ run?: string }> } }
  }
  for (const step of workflow.jobs.build.steps) {
    if (!step.run) continue
    const nativeCommands = step.run.split("\n").filter(line => /^\s*bun(?:x)?\s/.test(line))
    expect(nativeCommands.length).toBeLessThanOrEqual(1)
  }
})

test("Windows packaging covers root changes, uses immutable actions and locked Rust dependencies", () => {
  const source = readFileSync(new URL("../.github/workflows/desktop-windows.yml", import.meta.url), "utf8")
  for (const path of ['"package.json"', '"scripts/**"', '"tests/**"', '"bunfig.toml"']) expect(source).toContain(path)
  for (const match of source.matchAll(/uses:\s+([^\s#]+)/g)) expect(match[1]).toMatch(/@[a-f0-9]{40}$/)
  expect(source).toContain("permissions:\n  contents: read")
  expect(source).toContain("persist-credentials: false")
  expect(source).toContain("--locked")
})

test("public build verification covers Windows and native Apple Silicon without pretending to sign or qualify", () => {
  const source = readFileSync(new URL("../.github/workflows/public-build-verification.yml", import.meta.url), "utf8")
  for (const runner of ["windows-2025", "macos-15"]) expect(source).toContain(runner)
  for (const command of ["bun test", "bun run typecheck", "bun run release:build", "bun run release:verify", "bun run vscode:package"]) expect(source).toContain(command)
  expect(source.indexOf("bun run vscode:package")).toBeLessThan(source.indexOf("bun run vscode:verify"))
  for (const match of source.matchAll(/uses:\s+([^\s#]+)/g)) expect(match[1]).toMatch(/@[a-f0-9]{40}$/)
  expect(source).toContain("permissions:\n  contents: read")
  expect(source).not.toContain("secrets.")
  expect(source).not.toContain("--write-skeleton")
  expect(source).not.toContain("gh release create")
})

test("clean public runners install preload dependencies before executing the architecture probe", () => {
  const workflow = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/public-build-verification.yml", import.meta.url), "utf8")) as {
    jobs: { verify: { steps: Array<{ name?: string; run?: string; shell?: string }> } }
  }
  const steps = workflow.jobs.verify.steps
  const install = steps.findIndex(step => step.run?.includes("bun install --frozen-lockfile"))
  const probe = steps.findIndex(step => step.run?.includes("validateQualificationHost"))
  expect(install).toBeGreaterThanOrEqual(0)
  expect(probe).toBeGreaterThan(install)
})

test("Windows VSIX ZIP verification runs outside the GNU tar Git Bash environment", () => {
  const workflow = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/public-build-verification.yml", import.meta.url), "utf8")) as {
    jobs: { verify: { steps: Array<{ run?: string; shell?: string; if?: string }> } }
  }
  const steps = workflow.jobs.verify.steps.filter(step => step.run?.trim() === "bun run vscode:verify")
  expect(steps).toHaveLength(2)
  expect(steps).toContainEqual(expect.objectContaining({ if: "runner.os == 'Windows'", shell: "pwsh" }))
  expect(steps).toContainEqual(expect.objectContaining({ if: "runner.os == 'macOS'", shell: "bash" }))
})

import { expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CLI_TARGETS, checkReleaseTag, collectReleaseAssets, expectedReleaseAssets, releaseNotes } from "../scripts/release/assets.ts"
import { MATHOS_PRODUCT_VERSION } from "@mathos/shared"

type Step = { name?: string; uses?: string; run?: string; if?: string; env?: Record<string, string>; with?: Record<string, unknown> }
type Job = { "runs-on": string; strategy?: { matrix: { include: { target: string }[] } }; permissions?: Record<string, string>; needs?: string[]; env?: Record<string, string>; steps: Step[] }
const source = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8").replaceAll("\r\n", "\n")
const workflow = Bun.YAML.parse(source) as { on: Record<string, unknown>; permissions: Record<string, string>; jobs: Record<string, Job> }

test("the release workflow runs only for version tags and can do nothing but draft", () => {
  expect(Object.keys(workflow.on)).toEqual(["push"])
  expect(workflow.on.push).toEqual({ tags: ["v*"] })
  expect(workflow.permissions).toEqual({ contents: "read" })
  for (const [name, job] of Object.entries(workflow.jobs)) expect(job.permissions ?? null).toEqual(name === "draft" ? { contents: "write" } : null)
  expect(workflow.jobs.draft!.needs).toEqual(["cli", "desktop"])
  const create = workflow.jobs.draft!.steps.find(step => step.run?.includes("gh release create"))!
  expect(create.run).toContain("--draft")
  expect(create.run).toContain("--verify-tag")
  expect(create.run).not.toContain("--latest")
  expect(source.match(/gh release/g)).toHaveLength(1)
  expect(source).not.toContain("secrets.")
  for (const match of source.matchAll(/uses:\s+([^\s#]+)/g)) expect(match[1]).toMatch(/@[a-f0-9]{40}$/)
  for (const job of Object.values(workflow.jobs)) {
    const checkout = job.steps.find(step => step.uses?.startsWith("actions/checkout@"))
    expect(checkout?.with?.["persist-credentials"]).toBe(false)
    for (const step of job.steps) expect(step.run?.split("\n").filter(line => /^\s*bun(?:x)?\s/.test(line)).length ?? 0).toBeLessThanOrEqual(1)
  }
})

test("every build checks the tag and the license gate and is verified natively before upload", () => {
  const cli = workflow.jobs.cli!, desktop = workflow.jobs.desktop!
  for (const job of [cli, desktop]) expect(job.steps.some(step => step.run?.includes("assets.ts check-tag"))).toBe(true)
  expect(cli.env).toMatchObject({ MATHOS_RELEASE_ENRICH_LICENSES: "1", MATHOS_RELEASE_REQUIRE_COMPLETE_LICENSES: "1", MATHOS_LEAN_AUTO_INSTALL: "0" })
  const cliRuns = cli.steps.map(step => step.run ?? "")
  expect(cliRuns.indexOf("bun run release:build")).toBeLessThan(cliRuns.indexOf("bun run release:verify"))
  const desktopRuns = desktop.steps.map(step => step.run ?? "")
  const legal = desktopRuns.findIndex(run => run.includes("write-legal.ts") && run.includes("--require-complete"))
  expect(desktop.steps[legal]?.env?.MATHOS_RELEASE_ENRICH_LICENSES).toBe("1")
  expect(desktopRuns.findIndex(run => run.includes("smoke-host.ts"))).toBeLessThan(desktopRuns.findIndex(run => run.includes("tauri build")))
  expect(legal).toBeLessThan(desktopRuns.findIndex(run => run.includes("tauri build")))
  expect(desktopRuns.find(run => run.includes("tauri build"))).toContain("--locked")
})

test("the workflow builds exactly the shipped CLI targets and packages the extension on one of them", () => {
  const targets = workflow.jobs.cli!.strategy!.matrix.include.map(entry => entry.target)
  expect([...targets].sort()).toEqual([...CLI_TARGETS].sort())
  for (const step of workflow.jobs.cli!.steps.filter(step => step.run?.startsWith("bun run vscode:"))) {
    expect(CLI_TARGETS as readonly string[]).toContain(step.if?.match(/matrix\.target == '([^']+)'/)?.[1] ?? "")
  }
})

test("a tag must name the product version exactly", () => {
  expect(() => checkReleaseTag(`v${MATHOS_PRODUCT_VERSION}`)).not.toThrow()
  expect(() => checkReleaseTag(MATHOS_PRODUCT_VERSION)).toThrow("RELEASE_TAG_MISMATCH")
  expect(() => checkReleaseTag("v1.0.0", "1.0.0-rc.1")).toThrow("RELEASE_TAG_MISMATCH")
})

test("release notes come from the matching CHANGELOG section only", () => {
  const changelog = "# Changelog\n\n## 1.0.0 — 2026-10-20\n\nFirst stable release.\n\n## 1.0.0-rc.1\n\nCandidate.\n"
  expect(releaseNotes(changelog, "1.0.0")).toBe("First stable release.\n")
  expect(releaseNotes(changelog, "1.0.0-rc.1")).toBe("Candidate.\n")
  expect(() => releaseNotes(changelog, "1.0.1")).toThrow("RELEASE_NOTES_MISSING")
  expect(releaseNotes(readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8"), MATHOS_PRODUCT_VERSION).length).toBeGreaterThan(40)
})

test("collected assets are exactly the published downloads with one checksum file over all of them", () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-release-assets-"))
  try {
    const downloads = join(root, "downloads"), scripts = join(root, "install")
    mkdirSync(scripts)
    for (const name of ["install.sh", "install.ps1"]) writeFileSync(join(scripts, name), `${name}\n`)
    const version = "1.0.0"
    for (const name of expectedReleaseAssets(version).filter(name => !name.startsWith("install."))) {
      const directory = join(downloads, `artifact-${name.length}`, "nested")
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, name), `content of ${name}\n`)
    }
    writeFileSync(join(downloads, "unrelated.txt"), "ignored\n")
    const names = collectReleaseAssets(downloads, join(root, "out"), version, scripts)
    expect(names).toEqual([...expectedReleaseAssets(version), "SHA256SUMS"])
    const sums = readFileSync(join(root, "out", "SHA256SUMS"), "utf8").trim().split("\n")
    expect(sums).toHaveLength(expectedReleaseAssets(version).length)
    expect(sums).toContain(`${createHash("sha256").update("content of mathos-1.0.0-linux-x64.tar.gz\n").digest("hex")}  mathos-1.0.0-linux-x64.tar.gz`)
    rmSync(join(downloads, `artifact-${"mathos-1.0.0.vsix".length}`), { recursive: true })
    expect(() => collectReleaseAssets(downloads, join(root, "out2"), version, scripts)).toThrow("RELEASE_ASSET_MISSING")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

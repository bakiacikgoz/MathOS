import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

test("release checksum file covers every target archive with hashes of archive bytes", () => {
  const output = mkdtempSync(join(tmpdir(), "mathos-release-sums-"))
  try {
    const version = "1.0.0-rc.1"
    const windows = "mathos-1.0.0-rc.1-windows-x64.tar.gz"
    const mac = "mathos-1.0.0-rc.1-darwin-arm64.tar.gz"
    const versionDir = join(output, version)
    mkdirSync(versionDir, { recursive: true })
    for (const [name, bytes] of [[windows, "windows archive"], [mac, "mac archive"]]) {
      writeFileSync(join(versionDir, name!), bytes!)
    }
    const { writeReleaseArchiveChecksums } = require("../scripts/distribution/build-release.ts")
    expect(typeof writeReleaseArchiveChecksums).toBe("function")
    const checksumPath = writeReleaseArchiveChecksums(output, version)
    const expected = [
      `${createHash("sha256").update("mac archive").digest("hex")}  ${mac}`,
      `${createHash("sha256").update("windows archive").digest("hex")}  ${windows}`,
    ].join("\n") + "\n"
    expect(readFileSync(checksumPath, "utf8")).toBe(expected)
    expect(existsSync(join(output, version, "SHA256SUMS"))).toBe(true)
  } finally { rmSync(output, { recursive: true, force: true }) }
})

test.skipIf(process.platform !== "win32")("release archive uses Windows tar when Git tar is first on PATH", () => {
  const output = mkdtempSync(join(tmpdir(), "mathos-release-tar-"))
  try {
    const releaseRoot = join(output, "root"), archivePath = join(output, "sürüm", "release.tar.gz")
    mkdirSync(releaseRoot)
    mkdirSync(dirname(archivePath))
    writeFileSync(join(releaseRoot, "NOTICE"), "Windows archive")
    const gitTar = join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "usr", "bin", "tar.exe")
    expect(existsSync(gitTar)).toBe(true)
    const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === "path") ?? "Path"
    const env = { ...process.env, [pathKey]: `${dirname(gitTar)};${process.env[pathKey] ?? ""}` }
    const selected = Bun.spawnSync(["powershell.exe", "-NoProfile", "-Command", "(Get-Command tar.exe).Source"], { env, stdout: "pipe", stderr: "pipe" })
    if (selected.exitCode !== 0) throw new Error(selected.stderr.toString())
    expect(resolve(selected.stdout.toString().trim()).toLowerCase()).toBe(resolve(gitTar).toLowerCase())
    const modulePath = resolve(import.meta.dir, "../scripts/distribution/build-release.ts")
    const script = `const { createReleaseArchive } = require(${JSON.stringify(modulePath)}); createReleaseArchive(${JSON.stringify(releaseRoot)}, ${JSON.stringify(archivePath)})`
    const result = Bun.spawnSync([process.execPath, "-e", script], { cwd: resolve(import.meta.dir, ".."), env, stdout: "pipe", stderr: "pipe" })
    if (result.exitCode !== 0) throw new Error(`Release archive failed: ${result.stderr.toString()}`)
    expect(existsSync(archivePath)).toBe(true)
    const nativeTar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
    const listing = Bun.spawnSync([nativeTar, "-tzf", archivePath], { stdout: "pipe", stderr: "pipe" })
    if (listing.exitCode !== 0) throw new Error(`Release archive unreadable: ${listing.stderr.toString()}`)
    expect(listing.stdout.toString()).toContain("root/NOTICE")
  } finally { rmSync(output, { recursive: true, force: true }) }
})

test("generated Homebrew formula installs assets at runtime layout sibling share directory", () => {
  const output = mkdtempSync(join(tmpdir(), "mathos-formula-"))
  try {
    const formula = join(output, "mathos.rb")
    const script = resolve(import.meta.dir, "../scripts/distribution/generate-homebrew-formula.ts")
    const run = Bun.spawnSync([process.execPath, script, "1.0.0-rc.1", "https://example.invalid/mathos.tar.gz", "a".repeat(64), formula], { stdout: "pipe", stderr: "pipe" })
    expect(run.exitCode).toBe(0)
    const text = readFileSync(formula, "utf8")
    expect(text).toContain('bin.install "root/bin/mathos"')
    expect(text).toContain('share.install "root/share/mathos"')
    expect(text).toContain('pkgshare.install "root/LICENSE", "root/NOTICE", "root/SOURCE.json", "root/SBOM.json", "root/THIRD_PARTY_LICENSES.json", "root/THIRD_PARTY_NOTICES.txt"')
  } finally { rmSync(output, { recursive: true, force: true }) }
})

test("release root carries its own license, notice, and matching source revision", () => {
  const output = mkdtempSync(join(tmpdir(), "mathos-release-legal-"))
  try {
    const source = join(output, "source"), release = join(output, "release"), revision = "0123456789012345678901234567890123456789"
    mkdirSync(source); mkdirSync(release)
    writeFileSync(join(source, "LICENSE"), "License text")
    writeFileSync(join(source, "NOTICE"), "Notice text")
    const { packageReleaseLegalMetadata } = require("../scripts/distribution/build-release.ts")
    expect(typeof packageReleaseLegalMetadata).toBe("function")
    expect(packageReleaseLegalMetadata(source, release, revision)).toEqual(["LICENSE", "NOTICE", "SOURCE.json"])
    expect(readFileSync(join(release, "LICENSE"), "utf8")).toBe("License text")
    expect(readFileSync(join(release, "NOTICE"), "utf8")).toBe("Notice text")
    expect(JSON.parse(readFileSync(join(release, "SOURCE.json"), "utf8"))).toEqual({
      gitRevision: revision,
      sourceUrl: `https://github.com/bakiacikgoz/MathOS/tree/${revision}`,
    })
  } finally { rmSync(output, { recursive: true, force: true }) }
})

import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, linkSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

test.skipIf(process.platform !== "win32")("PowerShell installer verifies archive and retains assets next to installed CLI", () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-install-win-"))
  try {
    const bundle = join(root, "bundle"), release = join(root, "sürüm dosyaları"), installed = join(root, "kurulu MathOS")
    const version = "1.0.0-rc.1", archive = `mathos-${version}-windows-x64.tar.gz`
    mkdirSync(join(bundle, "root", "bin"), { recursive: true })
    mkdirSync(join(bundle, "root", "share", "mathos", "atlas"), { recursive: true })
    mkdirSync(release)
    copyFileSync(join(process.env.SystemRoot!, "System32", "curl.exe"), join(bundle, "root", "bin", "mathos.exe"))
    writeFileSync(join(bundle, "root", "share", "mathos", "atlas", "index.html"), "Atlas installed asset")
    writeFileSync(join(bundle, "root", "LICENSE"), "MathOS license")
    writeFileSync(join(bundle, "root", "NOTICE"), "MathOS notice")
    writeFileSync(join(bundle, "root", "SOURCE.json"), '{"gitRevision":"0123456789012345678901234567890123456789"}')
    writeFileSync(join(bundle, "root", "SBOM.json"), '{"spdxVersion":"SPDX-2.3"}')
    writeFileSync(join(bundle, "root", "THIRD_PARTY_LICENSES.json"), '{"releaseBlocked":true}')
    writeFileSync(join(bundle, "root", "THIRD_PARTY_NOTICES.txt"), "Third party notices")
    const archivePath = join(release, archive)
    const tar = Bun.spawnSync(["tar", "-czf", archivePath, "-C", bundle, "root"], { stdout: "pipe", stderr: "pipe" })
    expect(tar.exitCode).toBe(0)
    const hash = createHash("sha256").update(readFileSync(archivePath)).digest("hex")
    writeFileSync(join(release, "SHA256SUMS"), `${hash}  ${archive}\n`)
    const script = resolve(import.meta.dir, "../scripts/install/install.ps1")
    const env = { ...process.env, MATHOS_RELEASE_BASE_URL: pathToFileURL(release).href, MATHOS_VERSION: version, MATHOS_INSTALL_ROOT: installed }
    const result = Bun.spawnSync(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], { env, stdout: "pipe", stderr: "pipe" })
    if (result.exitCode !== 0) throw new Error(result.stderr.toString() || result.stdout.toString())
    expect(existsSync(join(installed, "bin", "mathos.exe"))).toBe(true)
    expect(readFileSync(join(installed, "share", "mathos", "atlas", "index.html"), "utf8")).toBe("Atlas installed asset")
    expect(readFileSync(join(installed, "share", "mathos", "SOURCE.json"), "utf8")).toContain("gitRevision")
    expect(readFileSync(join(installed, "share", "mathos", "SBOM.json"), "utf8")).toContain("SPDX-2.3")
    expect(readFileSync(join(installed, "share", "mathos", "THIRD_PARTY_LICENSES.json"), "utf8")).toContain("releaseBlocked")
    expect(readFileSync(join(installed, "share", "mathos", "THIRD_PARTY_NOTICES.txt"), "utf8")).toBe("Third party notices")

    writeFileSync(archivePath, "corrupted archive")
    const corruptRoot = join(root, "must-not-install")
    const corrupt = Bun.spawnSync(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], { env: { ...env, MATHOS_INSTALL_ROOT: corruptRoot }, stdout: "pipe", stderr: "pipe" })
    expect(corrupt.exitCode).not.toBe(0)
    expect(existsSync(join(corruptRoot, "bin", "mathos.exe"))).toBe(false)

    linkSync(join(bundle, "root", "share", "mathos", "atlas", "index.html"), join(bundle, "root", "share", "mathos", "atlas", "linked.html"))
    const malicious = Bun.spawnSync(["tar", "-czf", archivePath, "-C", bundle, "root"], { stdout: "pipe", stderr: "pipe" })
    expect(malicious.exitCode).toBe(0)
    const maliciousHash = createHash("sha256").update(readFileSync(archivePath)).digest("hex")
    writeFileSync(join(release, "SHA256SUMS"), `${maliciousHash}  ${archive}\n`)
    const unsafeRoot = join(root, "must-reject-hardlink")
    const unsafe = Bun.spawnSync(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], { env: { ...env, MATHOS_INSTALL_ROOT: unsafeRoot }, stdout: "pipe", stderr: "pipe" })
    expect(unsafe.exitCode).not.toBe(0)
    expect(existsSync(join(unsafeRoot, "bin", "mathos.exe"))).toBe(false)

    unlinkSync(join(bundle, "root", "share", "mathos", "atlas", "linked.html"))
    const toPosix = (path: string) => path.replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`).replaceAll("\\", "/")
    const transformed = Bun.spawnSync(["C:\\Program Files\\Git\\bin\\bash.exe", "-c", 'tar -czf "$1" --transform="s|^root/share/mathos/atlas/index.html$|root/../outside.txt|" -C "$2" root', "--", toPosix(archivePath), toPosix(bundle)], { stdout: "pipe", stderr: "pipe" })
    expect(transformed.exitCode).toBe(0)
    const traversalHash = createHash("sha256").update(readFileSync(archivePath)).digest("hex")
    writeFileSync(join(release, "SHA256SUMS"), `${traversalHash}  ${archive}\n`)
    const traversalRoot = join(root, "must-reject-traversal")
    const traversal = Bun.spawnSync(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], { env: { ...env, MATHOS_INSTALL_ROOT: traversalRoot }, stdout: "pipe", stderr: "pipe" })
    expect(traversal.exitCode).not.toBe(0)
    expect(existsSync(join(traversalRoot, "bin", "mathos.exe"))).toBe(false)
    expect(existsSync(join(root, "outside.txt"))).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
}, 120_000)

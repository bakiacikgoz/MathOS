import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

for (const locked of ["asset", "binary"] as const) {
  test.skipIf(process.platform !== "win32")(`PowerShell upgrade preserves old files when ${locked} is locked`, () => {
    const script = resolve(import.meta.dir, "../scripts/install/install.ps1")
    const root = mkdtempSync(join(tmpdir(), `mathos-upgrade-lock-${locked}-`))
    try {
      const bundle = join(root, "bundle"), release = join(root, "release"), install = join(root, "installed")
      mkdirSync(join(bundle, "root", "bin"), { recursive: true })
      mkdirSync(join(bundle, "root", "share", "mathos", "atlas"), { recursive: true })
      mkdirSync(join(install, "bin"), { recursive: true })
      mkdirSync(join(install, "share", "mathos", "atlas"), { recursive: true })
      mkdirSync(release)
      copyFileSync(join(process.env.SystemRoot!, "System32", "curl.exe"), join(bundle, "root", "bin", "mathos.exe"))
      writeFileSync(join(bundle, "root", "share", "mathos", "atlas", "index.html"), "new asset")
      const metadata: Array<[string, string]> = [["LICENSE", "license"], ["NOTICE", "notice"], ["SOURCE.json", "{}"], ["SBOM.json", "{}"], ["THIRD_PARTY_LICENSES.json", "{}"], ["THIRD_PARTY_NOTICES.txt", "notices"]]
      for (const [name, value] of metadata) {
        writeFileSync(join(bundle, "root", name), value)
      }
      const oldBinary = join(install, "bin", "mathos.exe"), oldAsset = join(install, "share", "mathos", "atlas", "index.html")
      writeFileSync(oldBinary, "old binary bytes")
      writeFileSync(oldAsset, "old asset bytes")
      const archive = "mathos-1.0.0-rc.1-windows-x64.tar.gz", archivePath = join(release, archive)
      const tar = Bun.spawnSync(["tar", "-czf", archivePath, "-C", bundle, "root"], { stdout: "pipe", stderr: "pipe" })
      expect(tar.exitCode).toBe(0)
      const hash = createHash("sha256").update(readFileSync(archivePath)).digest("hex")
      writeFileSync(join(release, "SHA256SUMS"), `${hash}  ${archive}\n`)
      const lockedPath = locked === "asset" ? oldAsset : oldBinary
      const quote = (path: string) => path.replaceAll("'", "''")
      const command = `$lock = [IO.File]::Open('${quote(lockedPath)}', [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None); try { & '${quote(script)}' } finally { $lock.Dispose() }`
      const result = Bun.spawnSync(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
        env: { ...process.env, MATHOS_RELEASE_BASE_URL: pathToFileURL(release).href, MATHOS_VERSION: "1.0.0-rc.1", MATHOS_INSTALL_ROOT: install },
        stdout: "pipe", stderr: "pipe",
      })
      expect(result.exitCode).not.toBe(0)
      expect(readFileSync(oldBinary, "utf8")).toBe("old binary bytes")
      expect(readFileSync(oldAsset, "utf8")).toBe("old asset bytes")
    } finally { rmSync(root, { recursive: true, force: true }) }
  }, 120_000)
}

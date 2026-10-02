import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync, linkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "/bin/sh"
const toPosix = (path: string) => process.platform === "win32" ? path.replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`).replaceAll("\\", "/") : path

function fixture(os: "linux" | "darwin", corrupt = false, unsafeLink = false) {
  const root = mkdtempSync(join(tmpdir(), "mathos-installer-"))
  const version = "1.0.0-rc.1", target = `${os}-x64`, archive = `mathos-${version}-${target}.tar.gz`
  const bundle = join(root, "bundle"), release = join(root, "release"), installed = join(root, "kurulu MathOS")
  mkdirSync(join(bundle, "root", "bin"), { recursive: true })
  mkdirSync(join(bundle, "root", "share", "mathos", "atlas"), { recursive: true })
  mkdirSync(release, { recursive: true })
  const executable = join(bundle, "root", "bin", "mathos")
  writeFileSync(executable, '#!/bin/sh\n[ -f "$(dirname "$0")/../share/mathos/atlas/index.html" ] || exit 9\nprintf \'{"version":"1.0.0-rc.1"}\\n\'\n')
  chmodSync(executable, 0o755)
  writeFileSync(join(bundle, "root", "share", "mathos", "atlas", "index.html"), "Atlas installed asset")
  if (unsafeLink) linkSync(join(bundle, "root", "share", "mathos", "atlas", "index.html"), join(bundle, "root", "share", "mathos", "atlas", "linked.html"))
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
  if (corrupt) writeFileSync(archivePath, "corrupted archive")
  const toolDir = join(root, "tools")
  mkdirSync(toolDir)
  const uname = join(toolDir, "uname")
  writeFileSync(uname, `#!/bin/sh\ncase "$1" in -s) echo ${os};; -m) echo x86_64;; esac\n`)
  chmodSync(uname, 0o755)
  if (os === "darwin") {
    const shasum = join(toolDir, "shasum")
    if (process.platform === "win32") writeFileSync(shasum, '#!/bin/sh\nexec /usr/bin/core_perl/shasum "$@"\n')
    else if (process.platform !== "darwin") writeFileSync(shasum, '#!/bin/sh\nexec sha256sum "$3"\n')
    if (existsSync(shasum)) chmodSync(shasum, 0o755)
  }
  return { root, bundle, release, archivePath, installed, toolDir }
}

for (const os of ["linux", "darwin"] as const) {
  test(`${os} installer verifies archive and launches installed binary with Atlas assets`, () => {
    const f = fixture(os)
    try {
      const script = resolve(import.meta.dir, "../scripts/install/install.sh")
      const command = 'PATH="$1:$PATH" exec sh "$2"'
      const result = Bun.spawnSync([shell, "-c", command, "--", toPosix(f.toolDir), toPosix(script)], {
        env: { ...process.env, MATHOS_RELEASE_BASE_URL: pathToFileURL(f.release).href, MATHOS_VERSION: "1.0.0-rc.1", MATHOS_INSTALL_DIR: `${toPosix(f.installed)}/bin`, HOME: `${toPosix(f.root)}/home` },
        stdout: "pipe", stderr: "pipe",
      })
      if (result.exitCode !== 0) throw new Error(result.stderr.toString() || result.stdout.toString())
      expect(result.exitCode).toBe(0)
      expect(existsSync(join(f.installed, "bin", "mathos"))).toBe(true)
      expect(readFileSync(join(f.installed, "share", "mathos", "atlas", "index.html"), "utf8")).toBe("Atlas installed asset")
      expect(readFileSync(join(f.installed, "share", "mathos", "SOURCE.json"), "utf8")).toContain("gitRevision")
      expect(readFileSync(join(f.installed, "share", "mathos", "SBOM.json"), "utf8")).toContain("SPDX-2.3")
      expect(readFileSync(join(f.installed, "share", "mathos", "THIRD_PARTY_LICENSES.json"), "utf8")).toContain("releaseBlocked")
      expect(readFileSync(join(f.installed, "share", "mathos", "THIRD_PARTY_NOTICES.txt"), "utf8")).toBe("Third party notices")
    } finally { rmSync(f.root, { recursive: true, force: true }) }
  }, 30_000)
}

test("installer refuses corrupted archive before writing installed files", () => {
  const f = fixture("linux", true)
  try {
    const script = resolve(import.meta.dir, "../scripts/install/install.sh")
    const result = Bun.spawnSync([shell, "-c", 'PATH="$1:$PATH" exec sh "$2"', "--", toPosix(f.toolDir), toPosix(script)], {
      env: { ...process.env, MATHOS_RELEASE_BASE_URL: pathToFileURL(f.release).href, MATHOS_VERSION: "1.0.0-rc.1", MATHOS_INSTALL_DIR: `${toPosix(f.installed)}/bin`, HOME: `${toPosix(f.root)}/home` },
      stdout: "pipe", stderr: "pipe",
    })
    expect(result.exitCode).not.toBe(0)
    expect(existsSync(join(f.installed, "bin", "mathos"))).toBe(false)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
}, 30_000)

test("installer rejects a checksum-valid archive containing a hardlink", () => {
  const f = fixture("linux", false, true)
  try {
    const script = resolve(import.meta.dir, "../scripts/install/install.sh")
    const result = Bun.spawnSync([shell, "-c", 'PATH="$1:$PATH" exec sh "$2"', "--", toPosix(f.toolDir), toPosix(script)], {
      env: { ...process.env, MATHOS_RELEASE_BASE_URL: pathToFileURL(f.release).href, MATHOS_VERSION: "1.0.0-rc.1", MATHOS_INSTALL_DIR: `${toPosix(f.installed)}/bin`, HOME: `${toPosix(f.root)}/home` },
      stdout: "pipe", stderr: "pipe",
    })
    expect(result.exitCode).not.toBe(0)
    expect(existsSync(join(f.installed, "bin", "mathos"))).toBe(false)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
}, 30_000)

test.skipIf(process.platform !== "win32")("installer rejects traversal paths inside a checksum-valid archive", () => {
  const f = fixture("linux")
  try {
    const make = Bun.spawnSync([shell, "-c", 'tar -czf "$1" --transform="s|^root/share/mathos/atlas/index.html$|root/../outside.txt|" -C "$2" root', "--", toPosix(f.archivePath), toPosix(f.bundle)], { stdout: "pipe", stderr: "pipe" })
    expect(make.exitCode).toBe(0)
    const hash = createHash("sha256").update(readFileSync(f.archivePath)).digest("hex")
    writeFileSync(join(f.release, "SHA256SUMS"), `${hash}  mathos-1.0.0-rc.1-linux-x64.tar.gz\n`)
    const script = resolve(import.meta.dir, "../scripts/install/install.sh")
    const result = Bun.spawnSync([shell, "-c", 'PATH="$1:$PATH" exec sh "$2"', "--", toPosix(f.toolDir), toPosix(script)], {
      env: { ...process.env, MATHOS_RELEASE_BASE_URL: pathToFileURL(f.release).href, MATHOS_VERSION: "1.0.0-rc.1", MATHOS_INSTALL_DIR: `${toPosix(f.installed)}/bin`, HOME: `${toPosix(f.root)}/home` },
      stdout: "pipe", stderr: "pipe",
    })
    expect(result.exitCode).not.toBe(0)
    expect(existsSync(join(f.installed, "bin", "mathos"))).toBe(false)
    expect(existsSync(join(f.root, "outside.txt"))).toBe(false)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
}, 30_000)

for (const failure of ["backup", "activate"] as const) {
  test(`POSIX upgrade restores old files when binary ${failure} move fails`, () => {
    const f = fixture("linux")
    try {
      const oldBinary = join(f.installed, "bin", "mathos"), oldAsset = join(f.installed, "share", "mathos", "atlas", "index.html")
      mkdirSync(join(f.installed, "bin"), { recursive: true })
      mkdirSync(join(f.installed, "share", "mathos", "atlas"), { recursive: true })
      writeFileSync(oldBinary, "old binary bytes")
      writeFileSync(oldAsset, "old asset bytes")
      const alias = join(f.root, "install-alias")
      if (process.platform !== "win32") symlinkSync(f.installed, alias, "dir")
      const installDir = process.platform === "win32" ? `${toPosix(f.installed)}/bin` : `${toPosix(alias)}/bin`
      const physicalPath = Bun.spawnSync([shell, "-c", 'cd "$1" && pwd -P', "--", installDir], { stdout: "pipe", stderr: "pipe" })
      if (physicalPath.exitCode !== 0) throw new Error(physicalPath.stderr.toString())
      const canonicalDest = physicalPath.stdout.toString().trim()
      expect(canonicalDest.length).toBeGreaterThan(0)
      if (process.platform !== "win32") expect(installDir).not.toBe(canonicalDest)
      const failureMarker = join(f.root, "injected-mv-failure")
      const mv = join(f.toolDir, "mv")
      writeFileSync(mv, '#!/bin/sh\nif [ "$MATHOS_TEST_FAIL_STEP" = backup ]; then\n  case "$2" in "$MATHOS_TEST_CANONICAL_DEST"/mathos.old.*) printf "%s\\n" backup > "$MATHOS_TEST_FAIL_MARKER"; exit 73;; esac\nfi\nif [ "$MATHOS_TEST_FAIL_STEP" = activate ]; then\n  case "$1:$2" in "$MATHOS_TEST_CANONICAL_DEST"/mathos.new.*:"$MATHOS_TEST_CANONICAL_DEST"/mathos) printf "%s\\n" activate > "$MATHOS_TEST_FAIL_MARKER"; exit 73;; esac\nfi\nif [ -x /usr/bin/mv ]; then exec /usr/bin/mv "$@"; else exec /bin/mv "$@"; fi\n')
      chmodSync(mv, 0o755)
      const script = resolve(import.meta.dir, "../scripts/install/install.sh")
      const result = Bun.spawnSync([shell, "-c", 'PATH="$1:$PATH" exec sh "$2"', "--", toPosix(f.toolDir), toPosix(script)], {
        env: { ...process.env, MATHOS_RELEASE_BASE_URL: pathToFileURL(f.release).href, MATHOS_VERSION: "1.0.0-rc.1", MATHOS_INSTALL_DIR: installDir, MATHOS_TEST_CANONICAL_DEST: canonicalDest, MATHOS_TEST_FAIL_MARKER: toPosix(failureMarker), MATHOS_TEST_FAIL_STEP: failure, HOME: `${toPosix(f.root)}/home` },
        stdout: "pipe", stderr: "pipe",
      })
      expect(result.exitCode).toBe(73)
      expect(readFileSync(failureMarker, "utf8").trim()).toBe(failure)
      expect(readFileSync(oldBinary, "utf8")).toBe("old binary bytes")
      expect(readFileSync(oldAsset, "utf8")).toBe("old asset bytes")
    } finally { rmSync(f.root, { recursive: true, force: true }) }
  }, 30_000)
}

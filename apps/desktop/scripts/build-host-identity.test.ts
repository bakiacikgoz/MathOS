import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve, sep } from "node:path"

const desktopRoot = resolve(import.meta.dir, "..")
const gitRevision = "0123456789abcdef0123456789abcdef01234567"
const buildId = "desktop-identity-test"
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex")

test("compiled desktop host reports its build identity outside the checkout", () => {
  const rustc = Bun.spawnSync(["rustc", "-vV"], { stdout: "pipe" })
  expect(rustc.exitCode).toBe(0)
  const triple = new TextDecoder().decode(rustc.stdout).match(/^host:\s*(\S+)/m)?.[1]
  expect(triple).toBeDefined()
  const fileName = `mathos-host-${triple}${process.platform === "win32" ? ".exe" : ""}`
  const defaultSidecar = join(desktopRoot, "src-tauri", "binaries", fileName)
  const fixture = mkdtempSync(join(tmpdir(), "mathos-host-identity-test-"))
  const previousHash = existsSync(defaultSidecar) ? hash(defaultSidecar) : null
  try {
    const outputDir = join(fixture, "build")
    const built = Bun.spawnSync([process.execPath, join(import.meta.dir, "build-host.ts"), `--output-dir=${outputDir}`], {
      cwd: desktopRoot,
      env: { ...process.env, MATHOS_BUILD_REVISION: gitRevision, MATHOS_BUILD_ID: buildId },
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(new TextDecoder().decode(built.stderr)).toBe("")
    expect(built.exitCode).toBe(0)

    const source = join(outputDir, fileName)
    expect(existsSync(source)).toBe(true)
    expect(existsSync(defaultSidecar) ? hash(defaultSidecar) : null).toBe(previousHash)
    const runDir = join(fixture, "run")
    mkdirSync(runDir)
    const external = join(runDir, `mathos-host${process.platform === "win32" ? ".exe" : ""}`)
    copyFileSync(source, external)
    const env: Record<string, string | undefined> = { ...process.env, HOME: fixture, USERPROFILE: fixture, APPDATA: join(fixture, "appdata"), LOCALAPPDATA: join(fixture, "localappdata"), XDG_CONFIG_HOME: join(fixture, "config"), XDG_DATA_HOME: join(fixture, "data"), XDG_CACHE_HOME: join(fixture, "cache"), XDG_STATE_HOME: join(fixture, "state"), MATHOS_LEAN_AUTO_INSTALL: "0", MATHOS_SANDBOX_AUTO_PULL: "0" }
    delete env.MATHOS_BUILD_REVISION
    delete env.MATHOS_BUILD_ID
    const smoked = Bun.spawnSync([process.execPath, join(import.meta.dir, "smoke-host.ts"), external, `--expect-revision=${gitRevision}`, `--expect-build-id=${buildId}`], {
      cwd: fixture, env, stdout: "pipe", stderr: "pipe",
    })
    const stdout = new TextDecoder().decode(smoked.stdout)
    expect(new TextDecoder().decode(smoked.stderr)).toBe("")
    expect(smoked.exitCode).toBe(0)
    expect(stdout).toContain(`"gitRevision":"${gitRevision}"`)
    expect(stdout).toContain(`"buildId":"${buildId}"`)
  } finally {
    const target = resolve(fixture), tempRoot = resolve(tmpdir())
    if (!target.startsWith(`${tempRoot}${sep}`) || !basename(target).startsWith("mathos-host-identity-test-")) {
      throw new Error(`Unsafe test fixture cleanup: ${target}`)
    }
    rmSync(target, { recursive: true, force: true })
  }
}, 60_000)

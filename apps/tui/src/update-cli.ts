import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { homedir, tmpdir } from "node:os"
import { MATHOS_PRODUCT_VERSION, resolveRuntimeLayout } from "@mathos/shared"
import { RELEASE_REPOSITORY, compareVersionStrings, downloadReleaseAsset, latestRelease, releaseAssetName, updateStatus, type ReleaseSource } from "@mathos/update"

/** `update install 1.0.2`: the first argument after the action that looks like a version. */
const positionalVersion = (rest: string[]) => rest.slice(1).find((value) => /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value))?.replace(/^v/, "")

/** The release source; `MATHOS_UPDATE_API_URL` and `MATHOS_UPDATE_WEB_URL` point it at a mirror. */
function source(env: NodeJS.ProcessEnv = process.env): ReleaseSource {
  return { userAgent: `MathOS/${MATHOS_PRODUCT_VERSION}`, ...(env.MATHOS_UPDATE_API_URL ? { apiBase: env.MATHOS_UPDATE_API_URL } : {}), ...(env.MATHOS_UPDATE_WEB_URL ? { webBase: env.MATHOS_UPDATE_WEB_URL } : {}) }
}

const write = (text: string) => process.stdout.write(text)

/**
 * `mathos update` with no manifest: finds the latest release online, and installs it with that release's own installer,
 * which verifies the archive against SHA256SUMS, swaps the files and restores the old ones if the new binary fails to start.
 *
 *   mathos update [check] [--json]             is a newer release out?
 *   mathos update install [<version>]          install it (or that version) over this installation
 *   mathos update download --desktop [<version>] [--json]  fetch and verify the desktop setup (the desktop app runs it)
 *
 * The version is positional: `--version` is the CLI's own flag.
 */
export async function runOnlineUpdate(action: string, rest: string[]): Promise<number> {
  const json = rest.includes("--json")
  if (action === "check") {
    const status = updateStatus(MATHOS_PRODUCT_VERSION, await latestRelease(source()))
    if (json) write(`${JSON.stringify(status, null, 2)}\n`)
    else if (status.available) write(`MathOS ${status.latestVersion} is available (this is ${status.currentVersion}).\nInstall it with: mathos update install\nRelease notes: ${status.url}\n`)
    else write(`MathOS ${status.currentVersion} is up to date (latest release: ${status.latestVersion}).\n`)
    return 0
  }
  if (action === "download") {
    if (!rest.includes("--desktop")) throw new Error("UPDATE_DOWNLOAD_KIND_REQUIRED: pass --desktop")
    const version = positionalVersion(rest) ?? (await latestRelease(source())).version
    const name = releaseAssetName("desktop", version, process.platform, process.arch)
    const result = await downloadReleaseAsset({ ...source(), version, name, directory: join(tmpdir(), "MathOS-update") })
    write(json ? `${JSON.stringify({ schemaVersion: "mathos.update-download.v1", version, ...result }, null, 2)}\n` : `Downloaded and verified ${result.path}\n`)
    return 0
  }
  if (action === "install") return installRelease(rest, json)
  throw new Error(`UPDATE_ACTION_UNKNOWN: ${action}`)
}

async function installRelease(rest: string[], json: boolean): Promise<number> {
  const executable = process.execPath, layout = resolveRuntimeLayout({ executablePath: executable, platform: process.platform, home: homedir(), env: process.env })
  // Only an installed release can replace itself: a source checkout updates with git, the desktop app with its own setup.
  if (!/^mathos(\.exe)?$/i.test(basename(executable)) || !existsSync(layout.sharedAssetsRoot))
    throw new Error("UPDATE_NOT_A_RELEASE_INSTALL: this mathos is not an installed release (a source checkout updates with git pull; the desktop app updates itself)")
  const version = positionalVersion(rest) ?? (await latestRelease(source())).version
  const newer = compareVersionStrings(version, MATHOS_PRODUCT_VERSION)
  if (newer === null) throw new Error(`UPDATE_VERSION_INVALID: ${version}`)
  if (newer <= 0 && !rest.includes("--force")) {
    write(json ? `${JSON.stringify({ schemaVersion: "mathos.update-install.v1", installed: false, currentVersion: MATHOS_PRODUCT_VERSION, latestVersion: version })}\n` : `MathOS ${MATHOS_PRODUCT_VERSION} is up to date.\n`)
    return 0
  }
  cleanPreviousBinaries(dirname(executable))
  const work = mkdtempSync(join(tmpdir(), "mathos-update-"))
  try {
    const installer = await downloadReleaseAsset({ ...source(), version, name: releaseAssetName("installer", version, process.platform, process.arch), directory: work, maxBytes: 1024 * 1024 })
    if (!json) write(`Installing MathOS ${version} over ${MATHOS_PRODUCT_VERSION} in ${layout.installationRoot}…\n`)
    const env: Record<string, string | undefined> = { ...process.env, MATHOS_VERSION: version, ...(process.platform === "win32" ? { MATHOS_INSTALL_ROOT: layout.installationRoot } : { MATHOS_INSTALL_DIR: dirname(executable) }) }
    if (process.env.MATHOS_UPDATE_WEB_URL) env.MATHOS_RELEASE_BASE_URL = `${process.env.MATHOS_UPDATE_WEB_URL.replace(/\/$/, "")}/${RELEASE_REPOSITORY}/releases/download/v${version}`
    const argv = process.platform === "win32"
      ? ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", installer.path]
      : ["/bin/sh", installer.path]
    const result = Bun.spawnSync(argv, { env, stdin: "ignore", stdout: json ? "pipe" : "inherit", stderr: json ? "pipe" : "inherit" })
    if (json) write(`${JSON.stringify({ schemaVersion: "mathos.update-install.v1", installed: result.exitCode === 0, currentVersion: MATHOS_PRODUCT_VERSION, latestVersion: version, output: `${result.stdout?.toString() ?? ""}${result.stderr?.toString() ?? ""}`.trim().slice(-4000) }, null, 2)}\n`)
    if (result.exitCode !== 0) throw new Error(`UPDATE_INSTALL_FAILED: the installer stopped with code ${result.exitCode}; the previous MathOS is kept`)
    if (!json) write(`MathOS ${version} is installed. Run mathos --version to confirm.\n`)
    return 0
  } finally { rmSync(work, { recursive: true, force: true }) }
}

/** On Windows the running mathos.exe cannot be deleted, only renamed; the installer leaves it as mathos.old.*.exe for the next update to remove. */
function cleanPreviousBinaries(directory: string) {
  try { for (const name of readdirSync(directory)) if (/^mathos\.old\.[0-9a-f]+(\.exe)?$/i.test(name)) rmSync(join(directory, name), { force: true }) } catch { /* a copy still in use stays until next time */ }
}

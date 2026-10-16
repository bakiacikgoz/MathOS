import { afterAll, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { downloadReleaseAsset, latestRelease, parseSha256Sums, releaseAssetName, updateStatus } from "@mathos/update"

const setup = new TextEncoder().encode("MZ fake setup")
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
let apiAnswer: () => Response = () => Response.json({ tag_name: "v1.0.1", html_url: "https://github.com/o/r/releases/tag/v1.0.1", published_at: "2026-10-20T10:00:00Z", body: "Updates", draft: false, prerelease: false })
let sums = `${sha(setup)}  MathOS-1.0.1-windows-x64-setup.exe\n${"0".repeat(64)}  install.sh\n`
const server = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname
    if (path === "/api/repos/o/r/releases/latest") return apiAnswer()
    if (path === "/web/o/r/releases/latest") return new Response(null, { status: 302, headers: { location: "https://github.com/o/r/releases/tag/v1.0.2" } })
    if (path === "/web/o/r/releases/download/v1.0.1/SHA256SUMS") return new Response(sums)
    if (path === "/web/o/r/releases/download/v1.0.1/MathOS-1.0.1-windows-x64-setup.exe") return new Response(setup)
    if (path === "/web/o/r/releases/download/v1.0.1/install.sh") return new Response("#!/bin/sh\n")
    return new Response("missing", { status: 404 })
  },
})
const base = `http://127.0.0.1:${server.port}`
const source = { repository: "o/r", apiBase: `${base}/api`, webBase: `${base}/web` }
const dirs: string[] = []
afterAll(() => { server.stop(true); for (const dir of dirs) rmSync(dir, { recursive: true, force: true }) })

describe("online updates", () => {
  test("the latest release comes from the API, and a newer stable version is offered", async () => {
    const release = await latestRelease(source)
    expect(release).toEqual({ version: "1.0.1", url: "https://github.com/o/r/releases/tag/v1.0.1", publishedAt: "2026-10-20T10:00:00Z", notes: "Updates" })
    expect(updateStatus("1.0.0", release)).toMatchObject({ available: true, currentVersion: "1.0.0", latestVersion: "1.0.1" })
    expect(updateStatus("1.0.1", release).available).toBe(false)
    expect(updateStatus("1.1.0", release).available).toBe(false)
    expect(updateStatus("1.0.0", { ...release, version: "1.0.2-rc.1" }).available).toBe(false)
  })

  test("when the API refuses, the release page's redirect still names the version", async () => {
    apiAnswer = () => new Response("rate limited", { status: 403 })
    expect((await latestRelease(source)).version).toBe("1.0.2")
  })

  test("a release file is kept only when it matches SHA256SUMS", async () => {
    const directory = mkdtempSync(join(tmpdir(), "mathos-update-test-")); dirs.push(directory)
    const done = await downloadReleaseAsset({ ...source, version: "1.0.1", name: "MathOS-1.0.1-windows-x64-setup.exe", directory })
    expect(done).toMatchObject({ sha256: sha(setup), bytes: setup.byteLength })
    expect(readFileSync(done.path, "utf8")).toBe("MZ fake setup")
    await expect(downloadReleaseAsset({ ...source, version: "1.0.1", name: "install.sh", directory })).rejects.toThrow("UPDATE_CHECKSUM_MISMATCH")
    await expect(downloadReleaseAsset({ ...source, version: "1.0.1", name: "install.ps1", directory })).rejects.toThrow("UPDATE_CHECKSUM_MISSING")
    await expect(downloadReleaseAsset({ ...source, version: "1.0.1", name: "../evil", directory })).rejects.toThrow("UPDATE_ASSET_NAME_INVALID")
    expect(readdirSync(directory)).toEqual(["MathOS-1.0.1-windows-x64-setup.exe"])
    sums = `${sha(setup)}  MathOS-1.0.1-windows-x64-setup.exe\n${sha(setup)}  MathOS-1.0.1-windows-x64-setup.exe\n`
    await expect(downloadReleaseAsset({ ...source, version: "1.0.1", name: "MathOS-1.0.1-windows-x64-setup.exe", directory })).rejects.toThrow("UPDATE_CHECKSUM_DUPLICATED")
  })

  test("asset names follow the release layout for each computer", () => {
    expect(releaseAssetName("cli", "1.0.1", "win32", "x64")).toBe("mathos-1.0.1-windows-x64.tar.gz")
    expect(releaseAssetName("cli", "1.0.1", "darwin", "arm64")).toBe("mathos-1.0.1-darwin-arm64.tar.gz")
    expect(releaseAssetName("installer", "1.0.1", "linux", "x64")).toBe("install.sh")
    expect(releaseAssetName("installer", "1.0.1", "win32", "x64")).toBe("install.ps1")
    expect(releaseAssetName("desktop", "1.0.1", "win32", "x64")).toBe("MathOS-1.0.1-windows-x64-setup.exe")
    expect(() => releaseAssetName("desktop", "1.0.1", "darwin", "arm64")).toThrow("UPDATE_DESKTOP_PLATFORM_UNSUPPORTED")
    expect(parseSha256Sums(`${"a".repeat(64)} *bin.tar.gz\nnoise\n`).get("bin.tar.gz")).toBe("a".repeat(64))
  })
})

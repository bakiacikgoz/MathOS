import { expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { applyStandardLicenseTexts, createReleaseDependencyInventory, loadLicenseReviews } from "../scripts/distribution/dependency-inventory.ts"
import { enrichReleaseDependencyInventory } from "../scripts/distribution/license-registry.ts"

const REVISION = "a".repeat(40)
const CREATED = "2026-10-01T12:00:00Z"

function put(root: string, path: string, value: string) {
  const destination = join(root, path)
  mkdirSync(join(destination, ".."), { recursive: true })
  writeFileSync(destination, value)
}

test("release inventory includes separate root and desktop locks, nested versions, Rust crates, and installed asset licenses", () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-inventory-"))
  try {
    put(root, "package.json", JSON.stringify({ name: "mathos", version: "1.0.0", license: "AGPL-3.0-only" }))
    put(root, "LICENSE", "GNU AFFERO GENERAL PUBLIC LICENSE\n")
    put(root, "packages/core/package.json", JSON.stringify({ name: "@mathos/core", version: "0.1.0" }))
    put(root, "apps/desktop/package.json", JSON.stringify({ name: "@mathos/desktop", version: "1.0.0", license: "AGPL-3.0-only" }))
    put(root, "bun.lock", JSON.stringify({ lockfileVersion: 2, packages: {
      "@mathos/core": ["@mathos/core@workspace:packages/core"],
      "@scope/alpha": ["@scope/alpha@1.0.0", "", {}, "sha512-a"],
      "parent/@scope/alpha": ["@scope/alpha@2.0.0", "", {}, "sha512-b"],
    } }))
    put(root, "apps/desktop/bun.lock", JSON.stringify({ lockfileVersion: 1, packages: {
      "@lobehub/icons-static-svg": ["@lobehub/icons-static-svg@1.95.1", "", {}, "sha512-c"],
      "mathlive": ["mathlive@0.110.0", "", {}, "sha512-d"],
    } }))
    put(root, "node_modules/@scope/alpha/package.json", JSON.stringify({ name: "@scope/alpha", version: "1.0.0", license: "MIT" }))
    put(root, "node_modules/@scope/alpha/LICENSE", "MIT fixture license for alpha v1\n")
    put(root, "node_modules/.bun/@scope+alpha@2.0.0/node_modules/@scope/alpha/package.json", JSON.stringify({ name: "@scope/alpha", version: "2.0.0", license: "Apache-2.0" }))
    put(root, "node_modules/.bun/@scope+alpha@2.0.0/node_modules/@scope/alpha/LICENSE", "Apache fixture license for alpha v2\n")
    put(root, "apps/desktop/node_modules/@lobehub/icons-static-svg/package.json", JSON.stringify({ name: "@lobehub/icons-static-svg", version: "1.95.1", license: "MIT" }))
    put(root, "apps/desktop/node_modules/@lobehub/icons-static-svg/LICENSE", "Icon fixture notice\n")
    put(root, "apps/desktop/node_modules/mathlive/package.json", JSON.stringify({ name: "mathlive", version: "0.110.0", license: "MIT" }))
    put(root, "apps/desktop/node_modules/mathlive/LICENSE", "Font fixture notice\n")
    put(root, "apps/desktop/src-tauri/Cargo.lock", `version = 3\n[[package]]\nname = "mathos-desktop"\nversion = "1.0.0"\n[[package]]\nname = "serde"\nversion = "1.0.200"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n`)
    put(root, "apps/desktop/src-tauri/Cargo.toml", `[package]\nname = "mathos-desktop"\nversion = "1.0.0"\nlicense = "AGPL-3.0-only"\n`)
    const cargoCache = join(root, "cargo-registry")
    put(cargoCache, "serde-1.0.200/Cargo.toml", `[package]\nname = "serde"\nversion = "1.0.200"\nlicense = "MIT/Apache-2.0"\n`)
    put(cargoCache, "serde-1.0.200/LICENSE-MIT", "Rust fixture MIT text\n")

    const result = createReleaseDependencyInventory({ sourceRoot: root, gitRevision: REVISION, productVersion: "1.0.0", created: CREATED, cargoRegistryRoots: [cargoCache] })
    const rows = result.licenses.packages
    expect(rows.filter(row => row.name === "@scope/alpha").map(row => [row.version, row.license])).toEqual([["1.0.0", "MIT"], ["2.0.0", "Apache-2.0"]])
    expect(rows.find(row => row.ecosystem === "cargo" && row.name === "serde")).toMatchObject({ version: "1.0.200", license: "MIT OR Apache-2.0", licenseSource: "cargo-registry/Cargo.toml", rawLicense: "MIT/Apache-2.0" })
    expect(rows.find(row => row.name === "mathos-desktop" && row.lockfileEntry === "apps/desktop/src-tauri/Cargo.lock#mathos-desktop@1.0.0")).toMatchObject({
      ecosystem: "workspace", license: "AGPL-3.0-only", licenseSource: "apps/desktop/src-tauri/Cargo.toml",
      licenseEvidenceUrl: `https://github.com/bakiacikgoz/MathOS/blob/${REVISION}/apps/desktop/src-tauri/Cargo.toml`,
      source: `https://github.com/bakiacikgoz/MathOS/blob/${REVISION}/apps/desktop/src-tauri/Cargo.toml`,
    })
    expect(rows.find(row => row.name === "@mathos/core")).toMatchObject({ license: "AGPL-3.0-only", licenseSource: "LICENSE (repository scope)", licenseEvidenceUrl: `https://github.com/bakiacikgoz/MathOS/blob/${REVISION}/LICENSE` })
    expect(rows.filter(row => row.name === "@mathos/core")).toHaveLength(1)
    expect(result.licenses.runtimeAssetPackages).toEqual([
      { name: "@lobehub/icons-static-svg", version: "1.95.1", license: "MIT", metadataFound: true },
      { name: "mathlive", version: "0.110.0", license: "MIT", metadataFound: true },
    ])
    expect(result.licenses.unresolvedCount).toBe(0)
    expect(result.licenses.missingNoticeCount).toBe(0)
    expect(result.licenses.releaseBlocked).toBe(false)
    expect(result.sbom).toMatchObject({ spdxVersion: "SPDX-2.3", dataLicense: "CC0-1.0", SPDXID: "SPDXRef-DOCUMENT", creationInfo: { created: CREATED } })
    expect(result.sbom.documentNamespace).toContain(REVISION)
    expect(result.sbom.packages.length).toBe(rows.length)
    expect(result.sbom.relationships.filter(row => row.relationshipType === "DESCRIBES").length).toBe(rows.length)
    expect(result.sbom.packages.every(row => row.SPDXID.startsWith("SPDXRef-Package-") && row.licenseConcluded === "NOASSERTION")).toBe(true)
    expect(result.notices).toContain("@scope/alpha@1.0.0")
    expect(result.notices).toContain("MIT fixture license for alpha v1")
    expect(result.notices).toContain("Apache fixture license for alpha v2")
    expect(result.notices).toContain("Icon fixture notice")
    expect(result.notices).toContain("Font fixture notice")
    expect(result.notices).toContain("Rust fixture MIT text")
    expect(result.notices).toContain("spdx-exceptions 2.5.0, CC-BY-3.0, The Linux Foundation; Kyle E. Mitchell")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("non SPDX license prose remains raw evidence but does not claim a valid declared license", () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-inventory-"))
  try {
    put(root, "package.json", JSON.stringify({ name: "mathos", version: "1.0.0", license: "AGPL-3.0-only" }))
    put(root, "bun.lock", JSON.stringify({ packages: { "pkg": ["pkg@1.0.0", "", {}, "sha512-a"] } }))
    put(root, "apps/desktop/bun.lock", JSON.stringify({ packages: {} }))
    put(root, "node_modules/pkg/package.json", JSON.stringify({ name: "pkg", version: "1.0.0", license: "MIT/Apache-2.0" }))
    put(root, "apps/desktop/src-tauri/Cargo.lock", `version = 3\n`)
    put(root, "apps/desktop/src-tauri/Cargo.toml", `[package]\nname = "mathos-desktop"\nversion = "1.0.0"\n`)
    const result = createReleaseDependencyInventory({ sourceRoot: root, gitRevision: REVISION, productVersion: "1.0.0", created: CREATED, cargoRegistryRoots: [] })
    expect(result.licenses.packages.find(row => row.name === "pkg")).toMatchObject({ license: "NOASSERTION", rawLicense: "MIT/Apache-2.0" })
    expect(result.sbom.packages.find(row => row.name === "pkg")?.licenseDeclared).toBe("NOASSERTION")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("incomplete license expressions are not declared as SPDX licenses", () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-inventory-"))
  try {
    put(root, "package.json", JSON.stringify({ name: "mathos", version: "1.0.0", license: "AGPL-3.0-only" }))
    put(root, "bun.lock", JSON.stringify({ packages: { "pkg": ["pkg@1.0.0", "", {}, "sha512-a"] } }))
    put(root, "apps/desktop/bun.lock", JSON.stringify({ packages: {} }))
    put(root, "node_modules/pkg/package.json", JSON.stringify({ name: "pkg", version: "1.0.0", license: "MIT OR" }))
    put(root, "apps/desktop/src-tauri/Cargo.lock", `version = 3\n`)
    put(root, "apps/desktop/src-tauri/Cargo.toml", `[package]\nname = "mathos-desktop"\nversion = "1.0.0"\n`)
    const result = createReleaseDependencyInventory({ sourceRoot: root, gitRevision: REVISION, productVersion: "1.0.0", created: CREATED, cargoRegistryRoots: [] })
    expect(result.licenses.packages.find(row => row.name === "pkg")).toMatchObject({ license: "NOASSERTION", rawLicense: "MIT OR" })
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("unknown IDs and UNLICENSED remain release blockers even when a notice file exists", () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-inventory-"))
  try {
    put(root, "package.json", JSON.stringify({ name: "mathos", version: "1.0.0", license: "AGPL-3.0-only" }))
    put(root, "bun.lock", JSON.stringify({ packages: {
      "invented": ["invented@1.0.0", "", {}, "sha512-a"],
      "unlicensed": ["unlicensed@2.0.0", "", {}, "sha512-b"],
      "valid": ["valid@3.0.0", "", {}, "sha512-c"],
      "custom": ["custom@4.0.0", "", {}, "sha512-d"],
      "bad-exception": ["bad-exception@5.0.0", "", {}, "sha512-e"],
    } }))
    put(root, "apps/desktop/bun.lock", JSON.stringify({ packages: {} }))
    for (const [name, version, license] of [["invented", "1.0.0", "TotallyUnknownLicense"], ["unlicensed", "2.0.0", "UNLICENSED"], ["valid", "3.0.0", "Apache-2.0 WITH LLVM-exception"], ["custom", "4.0.0", "LicenseRef-Custom"], ["bad-exception", "5.0.0", "Apache-2.0 WITH TotallyUnknownException"]]) {
      put(root, `node_modules/${name}/package.json`, JSON.stringify({ name, version, license }))
      put(root, `node_modules/${name}/LICENSE`, `Notice for ${name}\n`)
    }
    put(root, "apps/desktop/src-tauri/Cargo.lock", `version = 3\n`)
    put(root, "apps/desktop/src-tauri/Cargo.toml", `[package]\nname = "mathos-desktop"\nversion = "1.0.0"\n`)
    const result = createReleaseDependencyInventory({ sourceRoot: root, gitRevision: REVISION, productVersion: "1.0.0", created: CREATED, cargoRegistryRoots: [] })
    expect(result.licenses.packages.filter(row => row.name === "invented" || row.name === "unlicensed").map(row => [row.license, row.rawLicense])).toEqual([
      ["NOASSERTION", "TotallyUnknownLicense"], ["NOASSERTION", "UNLICENSED"],
    ])
    expect(result.licenses.packages.find(row => row.name === "valid")?.license).toBe("Apache-2.0 WITH LLVM-exception")
    expect(result.licenses.packages.find(row => row.name === "custom")?.license).toBe("NOASSERTION")
    expect(result.licenses.packages.find(row => row.name === "bad-exception")?.license).toBe("NOASSERTION")
    expect(result.licenses.missingNoticeCount).toBe(0)
    expect(result.licenses.unresolvedCount).toBe(4)
    expect(result.licenses.releaseBlocked).toBe(true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("unknown licenses stay unresolved when installed metadata is missing or version mismatched", () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-inventory-"))
  try {
    put(root, "package.json", JSON.stringify({ name: "mathos", version: "1.0.0", license: "AGPL-3.0-only" }))
    put(root, "bun.lock", JSON.stringify({ packages: { "pkg": ["pkg@3.0.0", "", {}, "sha512-a"] } }))
    put(root, "apps/desktop/bun.lock", JSON.stringify({ packages: {} }))
    put(root, "node_modules/pkg/package.json", JSON.stringify({ name: "pkg", version: "2.0.0", license: "MIT" }))
    put(root, "apps/desktop/src-tauri/Cargo.lock", `version = 3\n[[package]]\nname = "crate"\nversion = "1.0.0"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n`)
    put(root, "apps/desktop/src-tauri/Cargo.toml", `[package]\nname = "mathos-desktop"\nversion = "1.0.0"\nlicense = "AGPL-3.0-only"\n`)
    const result = createReleaseDependencyInventory({ sourceRoot: root, gitRevision: REVISION, productVersion: "1.0.0", created: CREATED, cargoRegistryRoots: [] })
    expect(result.licenses.packages.filter(row => row.name === "pkg" || row.name === "crate").map(row => row.license)).toEqual(["NOASSERTION", "NOASSERTION"])
    expect(result.licenses.unresolvedCount).toBeGreaterThanOrEqual(2)
    expect(result.licenses.complete).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("official exact-version registry metadata resolves missing licenses and records source URLs", async () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-inventory-"))
  try {
    put(root, "package.json", JSON.stringify({ name: "mathos", version: "1.0.0", license: "AGPL-3.0-only" }))
    put(root, "bun.lock", JSON.stringify({ packages: { "pkg": ["pkg@3.0.0", "", {}, "sha512-a"] } }))
    put(root, "apps/desktop/bun.lock", JSON.stringify({ packages: {} }))
    put(root, "apps/desktop/src-tauri/Cargo.lock", `version = 3\n[[package]]\nname = "mathos-desktop"\nversion = "1.0.0"\n[[package]]\nname = "crate"\nversion = "1.0.0"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n`)
    put(root, "apps/desktop/src-tauri/Cargo.toml", `[package]\nname = "mathos-desktop"\nversion = "1.0.0"\nlicense = "AGPL-3.0-only"\n`)
    const inventory = createReleaseDependencyInventory({ sourceRoot: root, gitRevision: REVISION, productVersion: "1.0.0", created: CREATED, cargoRegistryRoots: [] })
    const urls: string[] = []
    await enrichReleaseDependencyInventory(inventory, { fetcher: async input => {
      const url = String(input); urls.push(url)
      if (url === "https://registry.npmjs.org/pkg/3.0.0") return new Response(JSON.stringify({ name: "pkg", version: "3.0.0", license: "MIT" }), { status: 200 })
      if (url === "https://crates.io/api/v1/crates/crate/1.0.0") return new Response(JSON.stringify({ version: { num: "1.0.0", license: "Apache-2.0" } }), { status: 200 })
      return new Response("missing", { status: 404 })
    }, maxRequests: 2, maxNoticeRequests: 0 })
    expect(urls).toEqual(["https://registry.npmjs.org/pkg/3.0.0", "https://crates.io/api/v1/crates/crate/1.0.0"])
    expect(inventory.licenses.packages.filter(row => row.name === "pkg" || row.name === "crate").map(row => [row.license, row.licenseSource])).toEqual([
      ["MIT", "https://registry.npmjs.org/pkg/3.0.0"],
      ["Apache-2.0", "https://crates.io/api/v1/crates/crate/1.0.0"],
    ])
    expect(inventory.sbom.packages.find(row => row.name === "pkg")?.licenseDeclared).toBe("MIT")
    expect(inventory.licenses.unresolvedCount).toBe(0)
    expect(inventory.licenses.releaseBlocked).toBe(true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("exact registry tarball license text is included without extracting files to disk", async () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-inventory-"))
  try {
    put(root, "package.json", JSON.stringify({ name: "mathos", version: "1.0.0", license: "AGPL-3.0-only" }))
    put(root, "bun.lock", JSON.stringify({ packages: { "pkg": ["pkg@1.0.0", "", {}, "sha512-a"] } }))
    put(root, "apps/desktop/bun.lock", JSON.stringify({ packages: {} }))
    put(root, "node_modules/pkg/package.json", JSON.stringify({ name: "pkg", version: "1.0.0", license: "MIT" }))
    put(root, "apps/desktop/src-tauri/Cargo.lock", `version = 3\n`)
    put(root, "apps/desktop/src-tauri/Cargo.toml", `[package]\nname = "mathos-desktop"\nversion = "1.0.0"\n`)
    const license = "Copyright 2026 fixture\nPermission is hereby granted\n"
    const header = Buffer.alloc(512)
    header.write("package/LICENSE", 0, "ascii")
    header.write(license.length.toString(8).padStart(11, "0") + "\0", 124, "ascii")
    const archive = gzipSync(Buffer.concat([header, Buffer.from(license), Buffer.alloc(512 - license.length), Buffer.alloc(1024)]))
    const inventory = createReleaseDependencyInventory({ sourceRoot: root, gitRevision: REVISION, productVersion: "1.0.0", created: CREATED, cargoRegistryRoots: [] })
    const urls: string[] = []
    await enrichReleaseDependencyInventory(inventory, { fetcher: async input => {
      const url = String(input); urls.push(url)
      if (url === "https://registry.npmjs.org/pkg/1.0.0") return new Response(JSON.stringify({ name: "pkg", version: "1.0.0", license: "MIT", dist: { tarball: "https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz" } }), { status: 200 })
      if (url === "https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz") return new Response(archive, { status: 200 })
      return new Response("missing", { status: 404 })
    }, maxRequests: 1, maxNoticeRequests: 1 })
    expect(urls).toEqual(["https://registry.npmjs.org/pkg/1.0.0", "https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz"])
    expect(inventory.notices).toContain(license.trim())
    expect(inventory.licenses.packages.find(row => row.name === "pkg")?.noticeFiles).toEqual(["package/LICENSE"])
    expect(inventory.licenses.missingNoticeCount).toBe(0)
    expect(inventory.licenses.releaseBlocked).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("a dropped registry request is retried instead of leaving the notice missing", async () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-inventory-"))
  try {
    put(root, "package.json", JSON.stringify({ name: "mathos", version: "1.0.0", license: "AGPL-3.0-only" }))
    put(root, "bun.lock", JSON.stringify({ packages: { "pkg": ["pkg@1.0.0", "", {}, "sha512-a"] } }))
    put(root, "apps/desktop/bun.lock", JSON.stringify({ packages: {} }))
    put(root, "node_modules/pkg/package.json", JSON.stringify({ name: "pkg", version: "1.0.0", license: "MIT" }))
    put(root, "apps/desktop/src-tauri/Cargo.lock", `version = 3\n`)
    put(root, "apps/desktop/src-tauri/Cargo.toml", `[package]\nname = "mathos-desktop"\nversion = "1.0.0"\n`)
    const license = "Copyright 2026 fixture\nPermission is hereby granted\n"
    const header = Buffer.alloc(512)
    header.write("package/LICENSE", 0, "ascii")
    header.write(license.length.toString(8).padStart(11, "0") + "\0", 124, "ascii")
    const archive = gzipSync(Buffer.concat([header, Buffer.from(license), Buffer.alloc(512 - license.length), Buffer.alloc(1024)]))
    const inventory = createReleaseDependencyInventory({ sourceRoot: root, gitRevision: REVISION, productVersion: "1.0.0", created: CREATED, cargoRegistryRoots: [] })
    const calls = new Map<string, number>()
    await enrichReleaseDependencyInventory(inventory, { fetcher: async input => {
      const url = String(input), call = (calls.get(url) ?? 0) + 1; calls.set(url, call)
      if (url === "https://registry.npmjs.org/pkg/1.0.0") {
        if (call === 1) throw new TypeError("fetch failed")
        return new Response(JSON.stringify({ name: "pkg", version: "1.0.0", license: "MIT", dist: { tarball: "https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz" } }), { status: 200 })
      }
      if (url === "https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz") return call === 1 ? new Response("busy", { status: 503 }) : new Response(archive, { status: 200 })
      return new Response("missing", { status: 404 })
    }, maxRequests: 1, maxNoticeRequests: 1, retryDelayMs: 0 })
    expect([...calls.values()]).toEqual([2, 2])
    expect(inventory.licenses.packages.find(row => row.name === "pkg")?.noticeFiles).toEqual(["package/LICENSE"])
    expect(inventory.licenses.releaseBlocked).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("a missing registry entry is not retried", async () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-inventory-"))
  try {
    minimalRoot(root, { "pkg": ["pkg@1.0.0", "", {}, "sha512-a"] })
    const inventory = createReleaseDependencyInventory({ sourceRoot: root, gitRevision: REVISION, productVersion: "1.0.0", created: CREATED, cargoRegistryRoots: [] })
    let calls = 0
    await enrichReleaseDependencyInventory(inventory, { fetcher: async () => { calls++; return new Response("missing", { status: 404 }) }, maxRequests: 1, maxNoticeRequests: 0, retryDelayMs: 0 })
    expect(calls).toBe(1)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

function minimalRoot(root: string, packages: Record<string, unknown[]>, desktop: Record<string, unknown[]> = {}) {
  put(root, "package.json", JSON.stringify({ name: "mathos", version: "1.0.0", license: "AGPL-3.0-only" }))
  put(root, "bun.lock", JSON.stringify({ packages }))
  put(root, "apps/desktop/bun.lock", JSON.stringify({ packages: desktop }))
  put(root, "apps/desktop/src-tauri/Cargo.lock", `version = 3\n`)
  put(root, "apps/desktop/src-tauri/Cargo.toml", `[package]\nname = "mathos-desktop"\nversion = "1.0.0"\n`)
}

test("packages reviewed as not distributed stay listed but leave the release gate, for the exact reviewed version only", () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-inventory-"))
  try {
    minimalRoot(root, { "tool": ["tool@1.0.0", "", {}, "sha512-a"], "other": ["other@2.0.0", "", {}, "sha512-b"] })
    put(root, "node_modules/tool/package.json", JSON.stringify({ name: "tool", version: "1.0.0", license: "SEE LICENSE IN LICENSE.md" }))
    put(root, "node_modules/other/package.json", JSON.stringify({ name: "other", version: "2.0.0", license: "SEE LICENSE IN LICENSE.md" }))
    const review = { decision: "not-distributed" as const, ecosystem: "npm-root" as const, reviewedAt: "2026-10-13", reason: "Build tool only.", evidence: "No release bundle imports it." }
    const result = createReleaseDependencyInventory({ sourceRoot: root, gitRevision: REVISION, productVersion: "1.0.0", created: CREATED, cargoRegistryRoots: [], bunRuntimeVersion: null,
      reviews: [{ ...review, packages: ["tool@1.0.0", "other@1.0.0"] }] })
    expect(result.licenses.packages.find(row => row.name === "tool")).toMatchObject({ license: "NOASSERTION", distribution: "not-distributed", review: { reason: "Build tool only." } })
    expect(result.licenses.packages.find(row => row.name === "other")?.distribution).toBeUndefined()
    expect(result.sbom.packages.map(row => row.name)).toContain("tool")
    expect(result.licenses).toMatchObject({ unresolvedCount: 1, missingNoticeCount: 1, notDistributedCount: 1, releaseBlocked: true })
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("the committed license review file is valid and names exact versions", () => {
  const reviews = loadLicenseReviews()
  expect(reviews.length).toBeGreaterThan(0)
  expect(reviews.every(review => review.packages.every(id => /^(?:@[^/@]+\/)?[^@]+@\d[^@]*$/.test(id)))).toBe(true)
  expect(() => loadLicenseReviews(join(import.meta.dir, "..", "package.json"))).toThrow("LICENSE_REVIEW_INVALID")
})

test("standard license text covers a valid SPDX package only after its exact source copy was searched", async () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-inventory-"))
  try {
    minimalRoot(root, {
      "searched": ["searched@1.0.0", "", {}, "sha512-a"],
      "dual": ["dual@1.0.0", "", {}, "sha512-b"],
      "excepted": ["excepted@1.0.0", "", {}, "sha512-c"],
      "unseen": ["unseen@1.0.0", "", {}, "sha512-d"],
    })
    put(root, "node_modules/searched/package.json", JSON.stringify({ name: "searched", version: "1.0.0", license: "ISC" }))
    put(root, "node_modules/excepted/package.json", JSON.stringify({ name: "excepted", version: "1.0.0", license: "Apache-2.0 WITH LLVM-exception" }))
    const header = Buffer.alloc(512)
    header.write("package/index.js", 0, "ascii")
    header.write((1).toString(8).padStart(11, "0") + "\0", 124, "ascii")
    const archive = gzipSync(Buffer.concat([header, Buffer.from("x"), Buffer.alloc(511), Buffer.alloc(1024)]))
    const inventory = createReleaseDependencyInventory({ sourceRoot: root, gitRevision: REVISION, productVersion: "1.0.0", created: CREATED, cargoRegistryRoots: [], bunRuntimeVersion: null, reviews: [] })
    await enrichReleaseDependencyInventory(inventory, { fetcher: async input => {
      const url = String(input)
      if (url === "https://registry.npmjs.org/dual/1.0.0") return new Response(JSON.stringify({ name: "dual", version: "1.0.0", license: "Zlib OR Apache-2.0 OR MIT", dist: { tarball: "https://registry.npmjs.org/dual/-/dual-1.0.0.tgz" } }), { status: 200 })
      if (url === "https://registry.npmjs.org/dual/-/dual-1.0.0.tgz") return new Response(archive, { status: 200 })
      if (url === "https://registry.npmjs.org/unseen/1.0.0") return new Response(JSON.stringify({ name: "unseen", version: "1.0.0", license: "MIT", dist: { tarball: "https://registry.npmjs.org/unseen/-/unseen-1.0.0.tgz" } }), { status: 200 })
      return new Response("missing", { status: 404 })
    }, maxRequests: 10, maxNoticeRequests: 10 })
    applyStandardLicenseTexts(inventory)
    const rows = Object.fromEntries(inventory.licenses.packages.map(row => [row.name, row]))
    expect(rows.searched).toMatchObject({ noticeSearch: "installed-package", noticeBasis: "spdx-standard-text", noticeFiles: ["spdx-standard-text:ISC"] })
    expect(rows.dual).toMatchObject({ noticeSearch: "registry-archive", noticeFiles: ["spdx-standard-text:MIT"] })
    expect(rows.excepted?.noticeFiles).toEqual([])
    expect(rows.unseen).toMatchObject({ license: "MIT", noticeFiles: [] })
    expect(rows.unseen?.noticeSearch).toBeUndefined()
    expect(inventory.notices).toContain("=== npm-root dual@1.0.0 ===")
    expect(inventory.notices).toContain("The registry archive of this exact version contains no license or notice file. Used under MIT")
    expect(inventory.notices).toContain("--- ISC ---\nISC License")
    expect(inventory.licenses).toMatchObject({ unresolvedCount: 0, missingNoticeCount: 2, releaseBlocked: true })
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("the embedded Bun runtime is inventoried with its license and LGPL texts, and blocks when that version was never reviewed", () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-inventory-"))
  try {
    minimalRoot(root, {})
    const reviewed = createReleaseDependencyInventory({ sourceRoot: root, gitRevision: REVISION, productVersion: "1.0.0", created: CREATED, cargoRegistryRoots: [], bunRuntimeVersion: "1.4.2", reviews: [] })
    expect(reviewed.licenses.packages.find(row => row.ecosystem === "runtime")).toMatchObject({ name: "bun", version: "1.4.2", license: "MIT",
      noticeFiles: ["bun-1.4.2-LICENSE.md", "spdx-standard-text:LGPL-2.0-only", "spdx-standard-text:LGPL-2.1-only"] })
    expect(reviewed.notices).toContain("Bun statically links JavaScriptCore")
    expect(reviewed.notices).toContain("GNU LIBRARY GENERAL PUBLIC LICENSE")
    expect(reviewed.licenses.releaseBlocked).toBe(false)
    const unknown = createReleaseDependencyInventory({ sourceRoot: root, gitRevision: REVISION, productVersion: "1.0.0", created: CREATED, cargoRegistryRoots: [], bunRuntimeVersion: "0.0.1", reviews: [] })
    expect(unknown.licenses).toMatchObject({ missingNoticeCount: 1, releaseBlocked: true })
  } finally { rmSync(root, { recursive: true, force: true }) }
})

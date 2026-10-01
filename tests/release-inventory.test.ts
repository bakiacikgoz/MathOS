import { expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { createReleaseDependencyInventory } from "../scripts/distribution/dependency-inventory.ts"
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
    put(root, "package.json", JSON.stringify({ name: "mathos", version: "1.0.0-rc.1", license: "AGPL-3.0-only" }))
    put(root, "LICENSE", "GNU AFFERO GENERAL PUBLIC LICENSE\n")
    put(root, "packages/core/package.json", JSON.stringify({ name: "@mathos/core", version: "0.1.0" }))
    put(root, "apps/desktop/package.json", JSON.stringify({ name: "@mathos/desktop", version: "1.0.0-rc.1", license: "AGPL-3.0-only" }))
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
    put(root, "apps/desktop/src-tauri/Cargo.lock", `version = 3\n[[package]]\nname = "mathos-desktop"\nversion = "1.0.0-rc.1"\n[[package]]\nname = "serde"\nversion = "1.0.200"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n`)
    put(root, "apps/desktop/src-tauri/Cargo.toml", `[package]\nname = "mathos-desktop"\nversion = "1.0.0-rc.1"\nlicense = "AGPL-3.0-only"\n`)
    const cargoCache = join(root, "cargo-registry")
    put(cargoCache, "serde-1.0.200/Cargo.toml", `[package]\nname = "serde"\nversion = "1.0.200"\nlicense = "MIT/Apache-2.0"\n`)
    put(cargoCache, "serde-1.0.200/LICENSE-MIT", "Rust fixture MIT text\n")

    const result = createReleaseDependencyInventory({ sourceRoot: root, gitRevision: REVISION, productVersion: "1.0.0-rc.1", created: CREATED, cargoRegistryRoots: [cargoCache] })
    const rows = result.licenses.packages
    expect(rows.filter(row => row.name === "@scope/alpha").map(row => [row.version, row.license])).toEqual([["1.0.0", "MIT"], ["2.0.0", "Apache-2.0"]])
    expect(rows.find(row => row.ecosystem === "cargo" && row.name === "serde")).toMatchObject({ version: "1.0.200", license: "MIT OR Apache-2.0", licenseSource: "cargo-registry/Cargo.toml", rawLicense: "MIT/Apache-2.0" })
    expect(rows.find(row => row.name === "mathos-desktop" && row.lockfileEntry === "apps/desktop/src-tauri/Cargo.lock#mathos-desktop@1.0.0-rc.1")).toMatchObject({
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

#!/usr/bin/env bun
import { readFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { assertMathOSCompatibility, currentBuildIdentity, MATHOS_PRODUCT_VERSION, verifyReleaseManifest, type ReleaseManifestV1 } from "@mathos/shared"
import { hostReleaseTarget } from "./build-release.ts"
const ROOT = resolve(import.meta.dir, "..", "..")

export function verifyRelease(releaseRoot: string, expected: { gitRevision: string; target: string; productVersion: string } = {
  gitRevision: currentBuildIdentity().gitRevision,
  target: basename(dirname(releaseRoot)),
  productVersion: MATHOS_PRODUCT_VERSION,
}) {
  const manifest = JSON.parse(readFileSync(join(releaseRoot, "RELEASE-MANIFEST.json"), "utf8")) as ReleaseManifestV1
  assertMathOSCompatibility({ workspaceSchemaVersion: 30, bridgeProtocolVersion: manifest.bridgeProtocolVersion, pluginApiVersion: manifest.pluginApiVersion, capsuleFormatVersion: 1, publicationFormatVersion: 1 })
  const integrity = verifyReleaseManifest(releaseRoot, manifest)
  const checksums = manifest.files.map(file => `${file.sha256}  ${file.path}`).join("\n") + "\n"
  if (readFileSync(join(releaseRoot, "SHA256SUMS"), "utf8") !== checksums) integrity.errors.push("RELEASE_CHECKSUM_FILE_MISMATCH")
  if (!/^[0-9a-f]{40}$/.test(expected.gitRevision) || manifest.gitRevision !== expected.gitRevision) integrity.errors.push("RELEASE_REVISION_MISMATCH")
  if (manifest.target !== expected.target) integrity.errors.push("RELEASE_TARGET_MISMATCH")
  if (manifest.productVersion !== expected.productVersion) integrity.errors.push("RELEASE_VERSION_MISMATCH")
  return { ok: integrity.errors.length === 0, manifest, errors: integrity.errors }
}
if (import.meta.main) {
  const releaseRoot = process.argv[2] ?? join(ROOT, "artifacts", "releases", MATHOS_PRODUCT_VERSION, hostReleaseTarget(), "root")
  const report = verifyRelease(releaseRoot)
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}

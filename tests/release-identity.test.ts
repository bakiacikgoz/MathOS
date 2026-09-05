import { expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createReleaseManifest } from "@mathos/shared"
import { verifyRelease } from "../scripts/distribution/verify-release.ts"

test("release verifier rejects an intact artifact from another revision, target or version", () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-release-identity-"))
  try {
    mkdirSync(join(root, "bin")); writeFileSync(join(root, "bin/mathos"), "artifact fixture")
    const manifest = createReleaseManifest({ root, target: "darwin-arm64", productVersion: "1.0.0-rc.1", gitRevision: "a".repeat(40), buildId: "test", paths: ["bin/mathos"] })
    writeFileSync(join(root, "RELEASE-MANIFEST.json"), JSON.stringify(manifest))
    writeFileSync(join(root, "SHA256SUMS"), manifest.files.map(f => `${f.sha256}  ${f.path}`).join("\n") + "\n")
    const verify = verifyRelease as (root: string, expected: { gitRevision: string; target: string; productVersion: string }) => ReturnType<typeof verifyRelease>
    const expected = { gitRevision: "a".repeat(40), target: "darwin-arm64", productVersion: "1.0.0-rc.1" }
    expect(verify(root, expected).ok).toBe(true)
    expect(verify(root, { ...expected, gitRevision: "b".repeat(40) }).errors).toContain("RELEASE_REVISION_MISMATCH")
    expect(verify(root, { ...expected, target: "windows-x64" }).errors).toContain("RELEASE_TARGET_MISMATCH")
    expect(verify(root, { ...expected, productVersion: "1.0.0" }).errors).toContain("RELEASE_VERSION_MISMATCH")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

import { expect, test } from "bun:test"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { assertProductVersionAlignment, MATHOS_PRODUCT_VERSION, readProductSurfaceVersions } from "@mathos/shared"
import { platformQualificationCommands } from "../scripts/qualification/platform-qualification.ts"

const repository = resolve(import.meta.dir, "..")
const surfaces = ["package.json", "apps/tui/package.json", "apps/atlas/package.json", "apps/vscode-extension/package.json", "apps/desktop/package.json", "apps/desktop/src-tauri/tauri.conf.json", "apps/desktop/src-tauri/Cargo.toml"]

for (const path of surfaces.slice(4)) test(`release identity catches a mismatched ${path}`, () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-surface-version-"))
  try {
    for (const surface of surfaces) { mkdirSync(dirname(join(root, surface)), { recursive: true }); copyFileSync(join(repository, surface), join(root, surface)) }
    const destination = join(root, path)
    if (path.endsWith("Cargo.toml")) writeFileSync(destination, readFileSync(destination, "utf8").replace(`version = "${MATHOS_PRODUCT_VERSION}"`, 'version = "9.0.0"'))
    else { const value = JSON.parse(readFileSync(destination, "utf8")); value.version = "9.0.0"; writeFileSync(destination, JSON.stringify(value)) }
    expect(() => assertProductVersionAlignment(readProductSurfaceVersions(root))).toThrow("PRODUCT_VERSION_MISMATCH")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("qualification commands use an explicit candidate version across CLI and VSIX artifacts", () => {
  const commands = platformQualificationCommands as (target: "windows-11-x64", version: string) => ReturnType<typeof platformQualificationCommands>
  const result = commands("windows-11-x64", "1.0.0")
  const text = JSON.stringify(result)
  expect(text).toContain("releases/1.0.0/windows-x64/root")
  expect(text).toContain("dist/mathos-1.0.0.vsix")
  expect(text).not.toContain("1.0.0-rc.1")
})

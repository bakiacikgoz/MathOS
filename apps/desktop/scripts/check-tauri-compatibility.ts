import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const npmPackages = [
  "@tauri-apps/api",
  "@tauri-apps/cli",
  "@tauri-apps/plugin-opener",
  "@tauri-apps/plugin-dialog",
] as const

function cargoVersion(lock: string, crate: string): string {
  const versions = lock.split(/^\[\[package\]\]\s*$/m).flatMap((block) => {
    const name = block.match(/^name\s*=\s*"([^"]+)"\s*$/m)?.[1]
    const version = block.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1]
    return name === crate && version ? [version] : []
  })
  if (versions.length !== 1) throw new Error(`Cargo.lock must contain exactly one ${crate} package, found ${versions.length}`)
  return versions[0]!
}

function majorMinor(version: string): string {
  const match = version.match(/^(\d+\.\d+)\.\d+$/)
  if (!match) throw new Error(`Invalid Tauri version: ${version}`)
  return match[1]!
}

export function checkTauriCompatibility(desktopRoot: string): void {
  const root = resolve(desktopRoot)
  const lock = readFileSync(join(root, "src-tauri", "Cargo.lock"), "utf8")
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const rust = {
    tauri: cargoVersion(lock, "tauri"),
    opener: cargoVersion(lock, "tauri-plugin-opener"),
    dialog: cargoVersion(lock, "tauri-plugin-dialog"),
  }
  const installed = new Map<string, string>()
  const errors: string[] = []

  for (const name of npmPackages) {
    const pinned = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name]
    if (!pinned || !/^\d+\.\d+\.\d+$/.test(pinned)) {
      errors.push(`${name} must be pinned to an exact version in package.json`)
    }
    try {
      const data = JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")) as { version?: string }
      if (!data.version) throw new Error("missing version")
      installed.set(name, data.version)
      if (pinned && data.version !== pinned) errors.push(`${name} installed ${data.version} differs from package.json ${pinned}`)
    } catch {
      errors.push(`${name} is not installed`)
    }
  }

  const api = installed.get("@tauri-apps/api")
  if (api && majorMinor(rust.tauri) !== majorMinor(api)) {
    errors.push(`tauri ${rust.tauri} requires the same major/minor as @tauri-apps/api ${api}`)
  }
  const cli = installed.get("@tauri-apps/cli")
  if (cli && majorMinor(rust.tauri) !== majorMinor(cli)) {
    errors.push(`tauri ${rust.tauri} requires the same major/minor as @tauri-apps/cli ${cli}`)
  }
  for (const [crate, rustVersion, npmName] of [
    ["tauri-plugin-opener", rust.opener, "@tauri-apps/plugin-opener"],
    ["tauri-plugin-dialog", rust.dialog, "@tauri-apps/plugin-dialog"],
  ] as const) {
    const jsVersion = installed.get(npmName)
    if (jsVersion && rustVersion !== jsVersion) {
      errors.push(`${crate} ${rustVersion} requires ${npmName} ${rustVersion}; installed ${npmName} ${jsVersion}`)
    }
  }

  if (errors.length > 0) throw new Error(errors.join("\n"))
}

if (import.meta.main) {
  const desktopRoot = process.argv[2] === "--root" ? process.argv[3] : join(import.meta.dir, "..")
  try {
    if (!desktopRoot) throw new Error("--root requires a directory")
    checkTauriCompatibility(desktopRoot)
    console.log("Tauri package versions compatible")
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

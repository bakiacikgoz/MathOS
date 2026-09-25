#!/usr/bin/env bun
// Compiles the desktop host into a standalone executable and places it where
// Tauri expects sidecars: src-tauri/binaries/mathos-host-<rust-target-triple>.
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import solidPlugin from "@opentui/solid/bun-plugin"

const root = resolve(import.meta.dir, "..")
const rustTriple = (() => {
  const explicit = process.argv.find((arg) => arg.startsWith("--triple="))?.slice(9) ?? process.env.TAURI_ENV_TARGET_TRIPLE
  if (explicit) return explicit
  const out = Bun.spawnSync(["rustc", "-vV"], { stdout: "pipe" })
  const host = new TextDecoder().decode(out.stdout).match(/^host:\s*(\S+)/m)?.[1]
  if (!host) throw new Error("DESKTOP_HOST_BUILD: cannot determine the Rust target triple; pass --triple=<triple>")
  return host
})()
const bunTargets: Record<string, string> = {
  "aarch64-apple-darwin": "bun-darwin-arm64",
  "x86_64-apple-darwin": "bun-darwin-x64",
  "x86_64-unknown-linux-gnu": "bun-linux-x64",
  "aarch64-unknown-linux-gnu": "bun-linux-arm64",
  "x86_64-pc-windows-msvc": "bun-windows-x64",
}
const target = bunTargets[rustTriple]
if (!target) throw new Error(`DESKTOP_HOST_BUILD: unsupported target ${rustTriple}`)
const outDir = resolve(root, "src-tauri/binaries")
mkdirSync(outDir, { recursive: true })
const outfile = resolve(outDir, `mathos-host-${rustTriple}${rustTriple.includes("windows") ? ".exe" : ""}`)
const result = await Bun.build({
  entrypoints: [resolve(root, "host/host.ts")],
  plugins: [solidPlugin],
  compile: { target: target as never, outfile, autoloadBunfig: false },
  minify: true,
  // Precompiled bytecode starts the host several times faster than parsing the bundle on every launch.
  bytecode: true,
  format: "esm",
})
if (!result.success) { for (const log of result.logs) console.error(log); process.exit(1) }
console.log(`Built desktop host: ${outfile}`)

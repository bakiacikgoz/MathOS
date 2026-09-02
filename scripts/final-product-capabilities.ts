import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { inspectSandbox } from "@mathos/computation"

const root = resolve(import.meta.dir, ".."), target = `${process.platform}-${process.arch}`
const sandbox = await inspectSandbox()
const checks = {
  realModel: Boolean(process.env.MATHOS_API_KEY && process.env.MATHOS_MODEL),
  sandbox: sandbox.available && sandbox.networkIsolation,
  vscodeHost: Boolean(Bun.which("code")),
  standaloneArtifact: existsSync(resolve(root, "artifacts", "releases", "1.0.0-rc.1", target, "root", "bin", process.platform === "win32" ? "mathos.exe" : "mathos")),
  windowsRuntimeEvidence: existsSync(resolve(root, "artifacts", "qualification", "windows-11-x64.json")),
  macosRuntimeEvidence: existsSync(resolve(root, "artifacts", "qualification", "macos-arm64.json")),
}
const blockers = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
console.log(JSON.stringify({ schemaVersion: "mathos.final-product-capabilities.v1", target, checks, sandbox, blockers, ready: blockers.length === 0 }, null, 2))
if (blockers.length) process.exitCode = 1

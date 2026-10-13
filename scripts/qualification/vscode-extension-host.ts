import { copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, closeSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { MATHOS_PRODUCT_VERSION } from "@mathos/shared"
import { collectKnownSecrets } from "../../packages/models/src/redact.ts"
import { inspectGitHead, inspectProcessTable, revisionsMatch } from "./vscode-extension-host-inspection.ts"

const root = resolve(import.meta.dir, "../..")
const arguments_ = process.argv.slice(2)
const positional = arguments_.filter((value) => !value.startsWith("--"))
if (!positional[0]) throw new Error("QUALIFICATION_WORKSPACE_REQUIRED: pass the existing workspace path as the first argument")
const workspaceRoot = resolve(positional[0])
const evidenceRoot = resolve(positional[1] ?? join(root, "artifacts/qualification/macos-2026-09-05"))
const executableOption = arguments_.find((value) => value.startsWith("--executable="))?.slice("--executable=".length)
const selectedProfile = arguments_.find((value) => value.startsWith("--select-profile="))?.slice("--select-profile=".length) ?? "codex-subscription"
const isWindows = process.platform === "win32"
// Windows has no fixed install location; pass --vscode-root= for a portable or user install.
const vscodeRoot = arguments_.find((value) => value.startsWith("--vscode-root="))?.slice("--vscode-root=".length)
  ?? (isWindows ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData/Local"), "Programs/Microsoft VS Code") : "/Applications/Visual Studio Code.app")
const vscodeExecutable = isWindows ? join(vscodeRoot, "Code.exe") : join(vscodeRoot, "Contents/MacOS/Code")
const vscodeCliScript = isWindows ? windowsCliScript(vscodeRoot) : join(vscodeRoot, "Contents/Resources/app/bin/code")
// code.cmd cannot be spawned without a shell, so the Windows CLI runs the same way code.cmd does.
const vscodeCli = (args: string[]) => Bun.spawnSync(isWindows ? [vscodeExecutable, vscodeCliScript, ...args] : [vscodeCliScript, ...args], {
  cwd: root, stdout: "pipe", stderr: "pipe",
  env: isWindows ? { ...process.env, ELECTRON_RUN_AS_NODE: "1", VSCODE_DEV: "" } : process.env,
})
const vsix = join(root, `dist/mathos-${MATHOS_PRODUCT_VERSION}.vsix`)

/** Recent Windows builds keep resources under a commit-named folder next to Code.exe. */
function windowsCliScript(installRoot: string) {
  const flat = join(installRoot, "resources/app/out/cli.js")
  if (existsSync(flat) || !existsSync(installRoot)) return flat
  return readdirSync(installRoot).map((name) => join(installRoot, name, "resources/app/out/cli.js")).find((path) => existsSync(path)) ?? flat
}
const releaseTarget = isWindows ? "windows-x64/root/bin/mathos.exe" : "darwin-arm64/root/bin/mathos"
const mathosExecutable = resolve(executableOption ?? join(root, `artifacts/releases/${MATHOS_PRODUCT_VERSION}/${releaseTarget}`))
const testRunner = join(root, "scripts/qualification/vscode-extension-host-runner.cjs")
const sourceRevisionInspection = inspectGitHead(root)

for (const [label, path] of Object.entries({ workspaceRoot, vscodeCliScript, vscodeExecutable, vsix, mathosExecutable, testRunner })) {
  if (!existsSync(path)) throw new Error(`${label} missing: ${path}`)
}
const standaloneVersionProbe = Bun.spawnSync([mathosExecutable, "--version", "--json"], { cwd: workspaceRoot, stdout: "pipe", stderr: "pipe" })
if (standaloneVersionProbe.exitCode !== 0) throw new Error(`Standalone version probe failed: ${standaloneVersionProbe.stderr.toString()}`)
const standaloneIdentity = JSON.parse(standaloneVersionProbe.stdout.toString())
const standaloneFile = isWindows ? describePortableExecutable(mathosExecutable) : Bun.spawnSync(["file", mathosExecutable], { stdout: "pipe", stderr: "pipe" }).stdout.toString().trim()
const expectedBinaryFormat = isWindows ? /^PE32\+ executable x86-64$/u : /Mach-O 64-bit executable arm64/u

/** `file` is not part of Windows, so the PE header is read directly. */
function describePortableExecutable(path: string) {
  const header = Buffer.alloc(4096), handle = openSync(path, "r")
  try { readSync(handle, header, 0, header.length, 0) } finally { closeSync(handle) }
  if (header.toString("latin1", 0, 2) !== "MZ") return "not a PE executable"
  const pe = header.readUInt32LE(0x3c)
  if (pe + 26 > header.length || header.toString("latin1", pe, pe + 4) !== "PE\0\0") return "not a PE executable"
  const machine = header.readUInt16LE(pe + 4), optionalMagic = header.readUInt16LE(pe + 24)
  return `${optionalMagic === 0x20b ? "PE32+" : "PE32"} executable ${machine === 0x8664 ? "x86-64" : `machine 0x${machine.toString(16)}`}`
}

mkdirSync(evidenceRoot, { recursive: true })
const sessionRoot = mkdtempSync(join(tmpdir(), "mathos-vscode-host-"))
const userDataDir = join(sessionRoot, "user-data")
const extensionsDir = join(sessionRoot, "extensions")
const invocationLog = join(evidenceRoot, "vscode-command-invocations.jsonl")
const executableWrapper = join(sessionRoot, isWindows ? "mathos-qualification-wrapper.exe" : "mathos-qualification-wrapper")
// MathOS runs against a copy of the user's settings: selecting a profile from VS Code must not change the real default.
const userDataRelative = isWindows ? "AppData/Roaming/MathOS" : "Library/Application Support/MathOS"
const userMathosRoot = isWindows && process.env.APPDATA ? join(process.env.APPDATA, "MathOS") : join(homedir(), userDataRelative)
const qualificationHome = join(sessionRoot, "home")
const qualificationMathosRoot = join(qualificationHome, userDataRelative)
const qualificationEnvironment = isWindows ? { HOME: qualificationHome, APPDATA: join(qualificationHome, "AppData/Roaming") } : { HOME: qualificationHome }
mkdirSync(join(qualificationMathosRoot, "config"), { recursive: true })
for (const name of ["config.toml", "model-profiles.json"]) {
  const source = join(userMathosRoot, "config", name)
  if (existsSync(source)) copyFileSync(source, join(qualificationMathosRoot, "config", name))
}
if (existsSync(join(userMathosRoot, "lean"))) symlinkSync(join(userMathosRoot, "lean"), join(qualificationMathosRoot, "lean"), isWindows ? "junction" : undefined)
const userConfigDigest = () => ["config.toml", "model-profiles.json"].map((name) => {
  const path = join(userMathosRoot, "config", name)
  return existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : "absent"
}).join(":")
const userConfigBefore = userConfigDigest()
mkdirSync(join(userDataDir, "User"), { recursive: true })
mkdirSync(extensionsDir, { recursive: true })
writeFileSync(invocationLog, "")
const wrapperSource = [
  "#!/usr/bin/env bun",
  'import { appendFileSync } from "node:fs"',
  `const executable = ${JSON.stringify(mathosExecutable)}`,
  `const logPath = ${JSON.stringify(invocationLog)}`,
  `const qualificationEnvironment = ${JSON.stringify(qualificationEnvironment)}`,
  "const args = process.argv.slice(2)",
  'const command = args[0] ?? ""',
  'const child = Bun.spawn([executable, ...args], { cwd: process.cwd(), env: { ...process.env, ...qualificationEnvironment }, stdin: "inherit", stdout: "pipe", stderr: "pipe" })',
  'const record = (event) => appendFileSync(logPath, `${JSON.stringify({ ...event, command, wrapperPid: process.pid, childPid: child.pid, at: new Date().toISOString() })}\\n`)',
  'record({ event: "start", executable, args })',
  "let stdoutBytes = 0, stderrBytes = 0, atlasText = '', atlasUrl = null",
  'const pump = async (stream, output, isStdout) => { for await (const chunk of stream) { const bytes = chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(String(chunk)); if (isStdout) { stdoutBytes += bytes.byteLength; if (command === "atlas" && !atlasUrl) { atlasText = `${atlasText}${new TextDecoder().decode(bytes)}`.slice(-2000); atlasUrl = atlasText.match(/http:\\/\\/127\\.0\\.0\\.1:\\d+/u)?.[0] ?? null; if (atlasUrl) record({ event: "atlas_url", url: atlasUrl }) } } else stderrBytes += bytes.byteLength; output.write(bytes) } }',
  'for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => { try { child.kill(signal) } catch {} })',
  "const [,, code] = await Promise.all([pump(child.stdout, process.stdout, true), pump(child.stderr, process.stderr, false), child.exited])",
  'record({ event: "exit", code, stdoutBytes, stderrBytes })',
  "process.exit(code)",
  "",
].join("\n")
if (isWindows) {
  // VS Code starts the configured executable without a shell, so Windows needs a real .exe rather than a script.
  const source = join(sessionRoot, "mathos-qualification-wrapper.ts")
  writeFileSync(source, wrapperSource)
  const compiled = Bun.spawnSync([process.execPath, "build", "--compile", source, "--outfile", executableWrapper], { cwd: root, stdout: "pipe", stderr: "pipe" })
  if (compiled.exitCode !== 0) throw new Error(`Qualification wrapper build failed: ${compiled.stderr.toString()}`)
} else writeFileSync(executableWrapper, wrapperSource, { mode: 0o700 })
writeFileSync(join(userDataDir, "User/settings.json"), `${JSON.stringify({
  "mathos.executablePath": executableWrapper,
  "telemetry.telemetryLevel": "off",
  "security.workspace.trust.startupPrompt": "never",
}, null, 2)}\n`)

function matchingBridgeProcesses(rows: string[]) {
  return rows.filter((line) => line.includes("bridge stdio"))
}

function matchingCommandProcesses(rows: string[]) {
  return rows.filter((line) => (line.includes(executableWrapper) || line.includes(mathosExecutable)) && /\s(?:atlas|doctor)(?:\s|$)/u.test(line))
}

const baselineProcessInspection = inspectProcessTable()
const baselineBridgeProcesses = matchingBridgeProcesses(baselineProcessInspection.rows)
const install = vscodeCli([
  "--user-data-dir", userDataDir,
  "--extensions-dir", extensionsDir,
  "--install-extension", vsix,
  "--force",
])
writeFileSync(join(evidenceRoot, "vscode-extension-install.log"), `${install.stdout.toString()}${install.stderr.toString()}`)
if (install.exitCode !== 0) throw new Error(`VSIX installation failed with exit ${install.exitCode}`)
const installedExtensionPath = readdirSync(extensionsDir)
  .map((name) => join(extensionsDir, name))
  .find((path) => path.includes("mathos-research.mathos-") && existsSync(join(path, "package.json")))
if (!installedExtensionPath) throw new Error(`Installed MathOS extension directory missing from ${extensionsDir}`)

const runtimeReport = join(evidenceRoot, "vscode-host-runtime.json")
const host = Bun.spawn([
  vscodeExecutable,
  workspaceRoot,
  `--extensionDevelopmentPath=${installedExtensionPath}`,
  `--extensionTestsPath=${testRunner}`,
  "--user-data-dir", userDataDir,
  "--extensions-dir", extensionsDir,
  "--disable-updates",
  "--skip-welcome",
  "--skip-release-notes",
  "--disable-workspace-trust",
], {
  cwd: root,
  env: { ...process.env, VSCODE_CLI: "1", MATHOS_VSCODE_RUNTIME_REPORT: runtimeReport, MATHOS_VSCODE_INVOCATION_LOG: invocationLog, MATHOS_QUALIFICATION_CONFIG: join(qualificationMathosRoot, "config/config.toml"), MATHOS_QUALIFICATION_SELECT_PROFILE: selectedProfile },
  stdout: "pipe",
  stderr: "pipe",
})

const timeout = setTimeout(() => host.kill(), 120_000)
const [stdout, stderr, exitCode] = await Promise.all([new Response(host.stdout).text(), new Response(host.stderr).text(), host.exited])
clearTimeout(timeout)
writeFileSync(join(evidenceRoot, "vscode-extension-host.log"), `${stdout}${stderr}`)
await Bun.sleep(1_000)
const teardownProcessInspection = inspectProcessTable()
const remainingBridgeProcesses = matchingBridgeProcesses(teardownProcessInspection.rows)
const remainingCommandProcesses = matchingCommandProcesses(teardownProcessInspection.rows)
const userConfigUnchanged = userConfigDigest() === userConfigBefore
const runtime = existsSync(runtimeReport) ? JSON.parse(readFileSync(runtimeReport, "utf8")) : null
const installed = vscodeCli(["--user-data-dir", userDataDir, "--extensions-dir", extensionsDir, "--list-extensions", "--show-versions"])
const evidenceText = `${install.stdout.toString()}${install.stderr.toString()}${stdout}${stderr}${JSON.stringify(runtime)}`
const literalSecretLeaks = collectKnownSecrets().filter((secret) => evidenceText.includes(secret)).length
const shapedSecretLeaks = [...evidenceText.matchAll(/(?:Bearer\s+\S+|sk-[A-Za-z0-9_-]{8,})/giu)].length
const summary = {
  schemaVersion: "mathos.vscode-extension-host-qualification.v1",
  vscodeVersion: vscodeCli(["--version"]).stdout.toString().split(/\r?\n/u)[0],
  vsix,
  realExecutable: mathosExecutable,
  standaloneIdentity,
  sourceRevision: sourceRevisionInspection.revision ?? null,
  sourceRevisionInspection,
  standaloneFile,
  configuredExecutable: "transparent qualification wrapper",
  installedExtension: installed.stdout.toString().split(/\r?\n/u).find((line) => line.startsWith("mathos-research.mathos@")) ?? null,
  workspaceRoot,
  extensionHostExitCode: exitCode,
  baselineBridgeProcesses,
  remainingBridgeProcesses,
  remainingCommandProcesses,
  processInspection: {
    baseline: { ok: baselineProcessInspection.ok, error: baselineProcessInspection.error ?? null },
    teardown: { ok: teardownProcessInspection.ok, error: teardownProcessInspection.error ?? null },
  },
  secretLeakCount: literalSecretLeaks + shapedSecretLeaks,
  selectedProfile,
  userConfigUnchanged,
  runtime,
  ready: exitCode === 0 && runtime?.ready === true && standaloneIdentity?.productVersion === MATHOS_PRODUCT_VERSION && sourceRevisionInspection.ok === true && revisionsMatch(standaloneIdentity?.gitRevision, sourceRevisionInspection.revision) && expectedBinaryFormat.test(standaloneFile) && runtime?.invocationEvents?.filter((event: any) => event.event === "start").every((event: any) => event.executable === mathosExecutable) === true && baselineProcessInspection.ok === true && teardownProcessInspection.ok === true && baselineBridgeProcesses.length === 0 && remainingBridgeProcesses.length === 0 && remainingCommandProcesses.length === 0 && literalSecretLeaks + shapedSecretLeaks === 0 && userConfigUnchanged,
}
writeFileSync(join(evidenceRoot, "vscode-host-summary.json"), `${JSON.stringify(summary, null, 2)}\n`)
rmSync(sessionRoot, { recursive: true, force: true })
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
if (!summary.ready) process.exit(1)

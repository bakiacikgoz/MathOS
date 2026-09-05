import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { collectKnownSecrets } from "../../packages/models/src/redact.ts"
import { inspectGitHead, inspectProcessTable, revisionsMatch } from "./vscode-extension-host-inspection.ts"

const root = resolve(import.meta.dir, "../..")
const arguments_ = process.argv.slice(2)
const positional = arguments_.filter((value) => !value.startsWith("--"))
const workspaceRoot = resolve(positional[0] ?? "/Users/baki/Documents/ChatGPT/mathos-first-research")
const evidenceRoot = resolve(positional[1] ?? join(root, "artifacts/qualification/macos-2026-09-05"))
const executableOption = arguments_.find((value) => value.startsWith("--executable="))?.slice("--executable=".length)
const vscodeCli = "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
const vscodeExecutable = "/Applications/Visual Studio Code.app/Contents/MacOS/Code"
const vsix = join(root, "dist/mathos-1.0.0-rc.1.vsix")
const mathosExecutable = resolve(executableOption ?? join(root, "artifacts/releases/1.0.0-rc.1/darwin-arm64/root/bin/mathos"))
const testRunner = join(root, "scripts/qualification/vscode-extension-host-runner.cjs")
const sourceRevisionInspection = inspectGitHead(root)

for (const [label, path] of Object.entries({ workspaceRoot, vscodeCli, vscodeExecutable, vsix, mathosExecutable, testRunner })) {
  if (!existsSync(path)) throw new Error(`${label} missing: ${path}`)
}
const standaloneVersionProbe = Bun.spawnSync([mathosExecutable, "--version", "--json"], { cwd: workspaceRoot, stdout: "pipe", stderr: "pipe" })
if (standaloneVersionProbe.exitCode !== 0) throw new Error(`Standalone version probe failed: ${standaloneVersionProbe.stderr.toString()}`)
const standaloneIdentity = JSON.parse(standaloneVersionProbe.stdout.toString())
const standaloneFile = Bun.spawnSync(["file", mathosExecutable], { stdout: "pipe", stderr: "pipe" }).stdout.toString().trim()

mkdirSync(evidenceRoot, { recursive: true })
const sessionRoot = mkdtempSync(join(tmpdir(), "mathos-vscode-host-"))
const userDataDir = join(sessionRoot, "user-data")
const extensionsDir = join(sessionRoot, "extensions")
const invocationLog = join(evidenceRoot, "vscode-command-invocations.jsonl")
const executableWrapper = join(sessionRoot, "mathos-qualification-wrapper")
mkdirSync(join(userDataDir, "User"), { recursive: true })
mkdirSync(extensionsDir, { recursive: true })
writeFileSync(invocationLog, "")
writeFileSync(executableWrapper, [
  "#!/usr/bin/env bun",
  'import { appendFileSync } from "node:fs"',
  `const executable = ${JSON.stringify(mathosExecutable)}`,
  `const logPath = ${JSON.stringify(invocationLog)}`,
  "const args = process.argv.slice(2)",
  'const command = args[0] ?? ""',
  'const child = Bun.spawn([executable, ...args], { cwd: process.cwd(), env: process.env, stdin: "inherit", stdout: "pipe", stderr: "pipe" })',
  'const record = (event) => appendFileSync(logPath, `${JSON.stringify({ ...event, command, wrapperPid: process.pid, childPid: child.pid, at: new Date().toISOString() })}\\n`)',
  'record({ event: "start", executable, args })',
  "let stdoutBytes = 0, stderrBytes = 0, atlasText = '', atlasUrl = null",
  'const pump = async (stream, output, isStdout) => { for await (const chunk of stream) { const bytes = chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(String(chunk)); if (isStdout) { stdoutBytes += bytes.byteLength; if (command === "atlas" && !atlasUrl) { atlasText = `${atlasText}${new TextDecoder().decode(bytes)}`.slice(-2000); atlasUrl = atlasText.match(/http:\\/\\/127\\.0\\.0\\.1:\\d+/u)?.[0] ?? null; if (atlasUrl) record({ event: "atlas_url", url: atlasUrl }) } } else stderrBytes += bytes.byteLength; output.write(bytes) } }',
  'for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => { try { child.kill(signal) } catch {} })',
  "const [,, code] = await Promise.all([pump(child.stdout, process.stdout, true), pump(child.stderr, process.stderr, false), child.exited])",
  'record({ event: "exit", code, stdoutBytes, stderrBytes })',
  "process.exit(code)",
  "",
].join("\n"), { mode: 0o700 })
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
const install = Bun.spawnSync([
  vscodeCli,
  "--user-data-dir", userDataDir,
  "--extensions-dir", extensionsDir,
  "--install-extension", vsix,
  "--force",
], { cwd: root, stdout: "pipe", stderr: "pipe" })
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
  env: { ...process.env, VSCODE_CLI: "1", MATHOS_VSCODE_RUNTIME_REPORT: runtimeReport, MATHOS_VSCODE_INVOCATION_LOG: invocationLog },
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
const runtime = existsSync(runtimeReport) ? JSON.parse(readFileSync(runtimeReport, "utf8")) : null
const installed = Bun.spawnSync([vscodeCli, "--user-data-dir", userDataDir, "--extensions-dir", extensionsDir, "--list-extensions", "--show-versions"], { stdout: "pipe", stderr: "pipe" })
const evidenceText = `${install.stdout.toString()}${install.stderr.toString()}${stdout}${stderr}${JSON.stringify(runtime)}`
const literalSecretLeaks = collectKnownSecrets().filter((secret) => evidenceText.includes(secret)).length
const shapedSecretLeaks = [...evidenceText.matchAll(/(?:Bearer\s+\S+|sk-[A-Za-z0-9_-]{8,})/giu)].length
const summary = {
  schemaVersion: "mathos.vscode-extension-host-qualification.v1",
  vscodeVersion: Bun.spawnSync([vscodeCli, "--version"], { stdout: "pipe" }).stdout.toString().split(/\r?\n/u)[0],
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
  runtime,
  ready: exitCode === 0 && runtime?.ready === true && standaloneIdentity?.productVersion === "1.0.0-rc.1" && sourceRevisionInspection.ok === true && revisionsMatch(standaloneIdentity?.gitRevision, sourceRevisionInspection.revision) && /Mach-O 64-bit executable arm64/u.test(standaloneFile) && runtime?.invocationEvents?.filter((event: any) => event.event === "start").every((event: any) => event.executable === mathosExecutable) === true && baselineProcessInspection.ok === true && teardownProcessInspection.ok === true && baselineBridgeProcesses.length === 0 && remainingBridgeProcesses.length === 0 && remainingCommandProcesses.length === 0 && literalSecretLeaks + shapedSecretLeaks === 0,
}
writeFileSync(join(evidenceRoot, "vscode-host-summary.json"), `${JSON.stringify(summary, null, 2)}\n`)
rmSync(sessionRoot, { recursive: true, force: true })
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
if (!summary.ready) process.exit(1)

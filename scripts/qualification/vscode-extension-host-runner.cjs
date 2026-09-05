const { execFileSync } = require("node:child_process")
const { existsSync, readFileSync, writeFileSync } = require("node:fs")
const { homedir } = require("node:os")
const { join } = require("node:path")
const vscode = require("vscode")

const requiredCommands = [
  "mathos.refresh",
  "mathos.showObjective",
  "mathos.openClaim",
  "mathos.openAtlas",
  "mathos.doctor",
  "mathos.showModelProviders",
  "mathos.selectModelProfile",
  "mathos.refreshProviderStatus",
  "mathos.showProviderQuota",
]

function bridgeProcesses(parentPid) {
  const output = execFileSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" })
  return output.split(/\r?\n/u).filter((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/u)
    return match && Number(match[2]) === parentPid && match[3].includes("bridge stdio")
  }).map((line) => line.trim())
}

function persistedDefaultProfile() {
  try {
    const config = readFileSync(join(homedir(), "Library/Application Support/MathOS/config/config.toml"), "utf8")
    return config.match(/^default_profile\s*=\s*"([^"]+)"/mu)?.[1] ?? null
  } catch {
    return null
  }
}

function invocationEvents(path) {
  if (!path || !existsSync(path)) return []
  return readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)] } catch { return [] }
  })
}

async function waitForEvidence(path, predicate, timeoutMs = 30_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const events = invocationEvents(path)
    if (predicate(events)) return events
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return invocationEvents(path)
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch { return false }
}

async function settle(label, operation, timeoutMs = 15_000) {
  const started = Date.now()
  try {
    const value = await Promise.race([
      operation(),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)),
    ])
    return { label, ok: true, durationMs: Date.now() - started, value: value ?? null }
  } catch (error) {
    return { label, ok: false, durationMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) }
  }
}

exports.run = async function run() {
  const evidencePath = process.env.MATHOS_VSCODE_RUNTIME_REPORT
  const invocationLogPath = process.env.MATHOS_VSCODE_INVOCATION_LOG
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ""
  const result = {
    schemaVersion: "mathos.vscode-extension-host-runtime.v1",
    vscodeVersion: vscode.version,
    extensionHostPid: process.pid,
    workspaceRoot,
    startedAt: new Date().toISOString(),
    activation: null,
    state: null,
    commands: [],
    bridgeProcessesAfterRefresh: [],
    persistedProfileBeforeCommand: persistedDefaultProfile(),
  }

  try {
    const extension = vscode.extensions.getExtension("mathos-research.mathos")
    if (!extension) throw new Error("Installed extension mathos-research.mathos was not discovered")
    const activation = await settle("activate", () => extension.activate(), 20_000)
    result.activation = { ...activation, isActive: extension.isActive }
    const extensionApi = activation.value
    result.state = typeof extensionApi?.snapshot === "function" ? extensionApi.snapshot() : null

    const available = await vscode.commands.getCommands(true)
    for (const command of requiredCommands) {
      result.commands.push({ command, registered: available.includes(command) })
    }

    const openedTerminals = []
    const terminalSubscription = vscode.window.onDidOpenTerminal((terminal) => openedTerminals.push(terminal))
    result.commands.push(await settle("mathos.refresh", () => vscode.commands.executeCommand("mathos.refresh"), 20_000))
    result.commands.push(await settle("mathos.showObjective", () => vscode.commands.executeCommand("mathos.showObjective")))
    result.commands.push(await settle("mathos.openClaim", () => vscode.commands.executeCommand("mathos.openClaim", "C-001"), 2_000))
    result.commands.push(await settle("mathos.showModelProviders", () => vscode.commands.executeCommand("mathos.showModelProviders")))
    result.commands.push(await settle("mathos.selectModelProfile", () => vscode.commands.executeCommand("mathos.selectModelProfile", "codex-subscription"), 20_000))
    result.commands.push(await settle("mathos.refreshProviderStatus", () => vscode.commands.executeCommand("mathos.refreshProviderStatus"), 20_000))
    result.commands.push(await settle("mathos.showProviderQuota", () => vscode.commands.executeCommand("mathos.showProviderQuota", "codex-subscription"), 2_000))
    result.commands.push(await settle("mathos.doctor", () => vscode.commands.executeCommand("mathos.doctor")))
    const doctorEvents = await waitForEvidence(invocationLogPath, (events) => events.some((event) => event.event === "exit" && event.command === "doctor"), 45_000)
    const doctorStart = doctorEvents.find((event) => event.event === "start" && event.command === "doctor") ?? null
    const doctorExit = doctorEvents.find((event) => event.event === "exit" && event.command === "doctor") ?? null
    result.commands.push(await settle("mathos.openAtlas", () => vscode.commands.executeCommand("mathos.openAtlas")))
    const invocationEventsBeforeCleanup = await waitForEvidence(invocationLogPath, (events) => events.some((event) => event.event === "atlas_url" && event.command === "atlas"), 15_000)
    const atlasReady = invocationEventsBeforeCleanup.find((event) => event.event === "atlas_url" && event.command === "atlas") ?? null
    const atlasStart = invocationEventsBeforeCleanup.find((event) => event.event === "start" && event.command === "atlas") ?? null
    result.doctorExecution = { start: doctorStart, exit: doctorExit }
    result.atlasExecution = { start: atlasStart, ready: atlasReady, httpStatus: null }
    if (atlasReady?.url) {
      const response = await fetch(atlasReady.url, { signal: AbortSignal.timeout(5_000), redirect: "manual" })
      result.atlasExecution.httpStatus = response.status
      await response.body?.cancel()
    }
    result.terminals = openedTerminals.map((terminal) => terminal.name)
    for (const terminal of openedTerminals) terminal.dispose()
    terminalSubscription.dispose()
    await waitForEvidence(invocationLogPath, () => !processExists(atlasStart?.childPid), 10_000)
    result.atlasExecution.processAliveAfterTerminalDispose = processExists(atlasStart?.childPid)
    result.invocationEvents = invocationEvents(invocationLogPath)
    await vscode.commands.executeCommand("mathos.showObjective")
    result.stateAfterCommands = typeof extensionApi?.snapshot === "function" ? extensionApi.snapshot() : null
    result.persistedProfileAfterCommand = persistedDefaultProfile()
    result.bridgeProcessesAfterRefresh = bridgeProcesses(process.pid)
    result.finishedAt = new Date().toISOString()
    result.ready = Boolean(
      result.activation?.ok &&
      result.activation?.isActive &&
      result.state?.claims?.some((claim) => claim.id === "C-001") &&
      result.state?.objective?.id === "C-001" &&
      result.state?.status === "Connected" &&
      result.commands.every((entry) => entry.registered !== false && entry.ok !== false) &&
      result.terminals?.includes("MathOS Atlas") &&
      result.terminals?.includes("MathOS Doctor") &&
      result.doctorExecution?.start?.args?.length === 1 &&
      result.doctorExecution?.start?.args?.[0] === "doctor" &&
      result.doctorExecution?.exit?.code === 0 &&
      result.doctorExecution?.exit?.stdoutBytes > 0 &&
      /^http:\/\/127\.0\.0\.1:\d+$/u.test(result.atlasExecution?.ready?.url ?? "") &&
      result.atlasExecution?.httpStatus === 401 &&
      result.atlasExecution?.processAliveAfterTerminalDispose === false &&
      result.persistedProfileBeforeCommand === "codex-subscription" &&
      result.persistedProfileAfterCommand === "codex-subscription" &&
      result.bridgeProcessesAfterRefresh.length === 1
    )
  } catch (error) {
    result.finishedAt = new Date().toISOString()
    result.ready = false
    result.error = error instanceof Error ? error.stack ?? error.message : String(error)
  }

  if (evidencePath) writeFileSync(evidencePath, `${JSON.stringify(result, null, 2)}\n`)
  const holdMs = Number(process.env.MATHOS_VSCODE_UI_HOLD_MS ?? 0)
  if (Number.isFinite(holdMs) && holdMs > 0) await new Promise((resolve) => setTimeout(resolve, holdMs))
  if (!result.ready) throw new Error(`VS Code Extension Host qualification failed: ${JSON.stringify(result)}`)
}

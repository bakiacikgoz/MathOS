import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openMathOSTerminal } from "./terminal-command.ts"

// The adapter supplies VS Code's terminal process boundary; the executable and
// shell are real. A return to shell text must break command execution here.
const ownedRoot = mkdtempSync(join(tmpdir(), "mathos-terminal-command-"))
const workspace = join(ownedRoot, "Türkçe çalışma & '$literal'")
const executable = join(workspace, process.platform === "win32" ? "mathos-probe.exe" : "mathos-probe")
beforeAll(() => {
  mkdirSync(workspace, { recursive: true })
  const source = join(ownedRoot, "probe.ts")
  writeFileSync(source, 'console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}))\n')
  const built = Bun.spawnSync([process.execPath, "build", source, "--compile", "--outfile", executable], { stdout: "pipe", stderr: "pipe", timeout: 30000, windowsHide: true })
  if (built.exitCode !== 0) throw new Error(`TERMINAL_PROBE_BUILD_FAILED:${built.stderr.toString()}`)
}, 35000)
afterAll(() => rmSync(ownedRoot, { recursive: true, force: true }))

for (const command of ["doctor", "atlas"] as const) test(`launches ${command} through a literal executable and argv in a Turkish workspace`, () => {
  let result: ReturnType<typeof Bun.spawnSync> | undefined
  let visible = false
  openMathOSTerminal({ createTerminal(options) {
    return {
      show() {
        visible = true
        result = Bun.spawnSync([options.shellPath!, ...options.shellArgs!], { cwd: options.cwd, stdout: "pipe", stderr: "pipe", timeout: 10000, windowsHide: true })
      },
      sendText(text: string) {
        const shell = process.platform === "win32" ? ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", text] : ["sh", "-c", text]
        result = Bun.spawnSync(shell, { cwd: options.cwd, stdout: "pipe", stderr: "pipe", timeout: 10000, windowsHide: true })
      },
    }
  } }, executable, workspace, command)
  if (result?.exitCode !== 0) throw new Error(`TERMINAL_PROBE_FAILED:${command}:exit=${String(result?.exitCode)}:signal=${String(result?.signalCode)}:${result?.stderr?.toString()}`)
  const observed = JSON.parse(result.stdout!.toString())
  expect(observed.args).toEqual([command])
  expect(realpathSync.native(observed.cwd)).toBe(realpathSync.native(workspace))
  expect(visible).toBe(true)
}, 15000)

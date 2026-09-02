import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const sourceRoot = resolve(import.meta.dir, "..")
const temporaryRoot = mkdtempSync(join(tmpdir(), "mathos-clean-room-"))
const cloneRoot = join(temporaryRoot, "checkout")
const cleanHome = join(temporaryRoot, "home")

function run(command: string[], cwd: string, env = process.env) {
  const result = Bun.spawnSync(command, { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const output = result.stdout.toString() + result.stderr.toString()
  if (result.exitCode !== 0) throw new Error(`CLEAN_ROOM_COMMAND_FAILED:${command.slice(0, 3).join(" ")}\n${output.slice(-4_000)}`)
  return output
}

try {
  run(["git", "clone", "--no-local", "--no-hardlinks", sourceRoot, cloneRoot], temporaryRoot)
  const cleanEnv = {
    ...process.env,
    HOME: cleanHome,
    USERPROFILE: cleanHome,
    XDG_CONFIG_HOME: join(cleanHome, "config"),
    XDG_DATA_HOME: join(cleanHome, "data"),
    XDG_CACHE_HOME: join(cleanHome, "cache"),
    XDG_STATE_HOME: join(cleanHome, "state"),
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  }
  const commands = [
    [process.execPath, "install", "--frozen-lockfile"],
    [process.execPath, "run", "release:build"],
    [process.execPath, "scripts/product-scale-benchmark.ts"],
    [process.execPath, "run", "release:verify"],
  ]
  const outputs = commands.map(command => run(command, cloneRoot, cleanEnv))
  const revision = run(["git", "rev-parse", "HEAD"], cloneRoot).trim()
  console.log(JSON.stringify({ schemaVersion: "mathos.clean-room-release.v1", passed: true, revision, commands: commands.length, evidenceBytes: outputs.reduce((sum, output) => sum + output.length, 0) }, null, 2))
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}

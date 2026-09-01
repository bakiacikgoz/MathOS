#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { runReleaseEval } from "../packages/core/src/release-eval.ts"
import { mathosVersion } from "@mathos/shared"
import { resolve } from "node:path"

const json = process.argv.includes("--json")
const rows: Array<{ name: string; result: string; detail?: string }> = []

const repositoryRoot = resolve(import.meta.dir, "..")

function run(name: string, cmd: string[], cwd = repositoryRoot) {
  const proc = spawnSync(cmd[0]!, cmd.slice(1), { cwd, encoding: "utf8", env: { ...process.env, PATH: process.env.PATH } })
  const ok = proc.status === 0
  rows.push({ name, result: ok ? "PASS" : "FAIL", detail: ok ? undefined : (proc.stderr || proc.stdout).slice(0, 400) })
  return ok
}

run("build", ["bun", "run", "build"])
run("tests", ["bun", "test", "tests/release.test.ts", "tests/core.test.ts", "tests/product-ux.test.ts"])

const evalRows = await runReleaseEval()
for (const row of evalRows) {
  if (row.id === "migrations") rows.push({ name: "migrations", result: row.result, detail: row.detail })
  if (row.id === "fresh-init") rows.push({ name: "fresh-init", result: row.result, detail: row.detail })
  if (row.id === "backup-restore") rows.push({ name: "backup-restore", result: row.result, detail: row.detail })
  if (row.id === "secret-redaction") rows.push({ name: "secret-redaction", result: row.result, detail: row.detail })
  if (row.id === "package-smoke") rows.push({ name: "package-smoke", result: row.result, detail: row.detail })
}

run("research-regression", ["bun", "scripts/research-regression.ts"])
run("ux-regression", ["bun", "scripts/ux-regression.ts"])
run("research-benchmark-regression", ["bun", "scripts/research-benchmark-regression.ts"])

const order = ["build", "tests", "migrations", "package-smoke", "fresh-init", "backup-restore", "secret-redaction", "research-regression", "ux-regression", "research-benchmark-regression"]
const mapped = order.map((name) => rows.find((row) => row.name === name) ?? { name, result: "FAIL", detail: "missing" })
const ready = mapped.every((row) => row.result === "PASS" || row.result.startsWith("SKIPPED"))

if (json) {
  console.log(JSON.stringify({ version: mathosVersion(), checks: mapped, eval: evalRows, ready }, null, 2))
} else {
  console.log("MATHOS RELEASE CHECK")
  console.log("")
  for (const row of mapped) console.log(`${row.name.padEnd(22)} ${row.result}`)
  console.log("")
  console.log(`Release candidate`)
  console.log(ready ? "READY" : "NOT_READY")
}
if (!ready) process.exit(1)

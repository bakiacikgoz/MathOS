import { runMultiAgentEval } from "../packages/core/src/multi-agent-eval.ts"

const json = process.argv.includes("--json")
const real = process.argv.includes("--real")
const realParallel = process.argv.includes("--real-parallel")
const rows = await runMultiAgentEval(realParallel ? "real-parallel" : real ? "native" : "fake")
if (json) {
  console.log(JSON.stringify({ mode: real ? "native" : "fake", scenarios: rows, passed: rows.every((row) => row.result === "PASS") }, null, 2))
} else {
  console.log("Scenario                    Result")
  for (const row of rows) console.log(`${row.id.padEnd(27)} ${row.result}`)
}
if (rows.some((row) => row.result === "FAIL")) process.exitCode = 1

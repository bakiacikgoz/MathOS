import { runGraphEval } from "../packages/core/src/graph-eval.ts"

const json = process.argv.includes("--json")
const rows = runGraphEval()
if (json) console.log(JSON.stringify({ rows }, null, 2))
else {
  console.log("Scenario                    Result")
  for (const row of rows) console.log(`${row.id.padEnd(27)} ${row.result}`)
}
if (rows.some((row) => row.result !== "PASS")) process.exitCode = 1

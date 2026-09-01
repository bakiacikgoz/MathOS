import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { RESEARCH_EVAL_SCENARIOS, runResearchScenario } from "../packages/core/src/research-eval.ts"
import { runMultiAgentScenario } from "../packages/core/src/multi-agent-eval.ts"

export interface QualityCostResult {
  mode: "FAKE_HARNESS" | "REAL_MODEL"
  decision: "PASS" | "FAIL" | "INCONCLUSIVE"
  single: { qualityPass: boolean; wallMs: number; cases: number; modelCalls: number | null; leanCalls: number | null; proofAttempts: number | null }
  multi: { qualityPass: boolean; wallMs: number; cases: number; agents: number; modelCalls: number | null; leanCalls: number | null; proofAttempts: number | null }
  note: string
}

export async function runPairedMultiAgentQualityBenchmark(realModelAvailable = false): Promise<QualityCostResult> {
  const singleStarted = performance.now()
  const single = await runResearchScenario(RESEARCH_EVAL_SCENARIOS[0]!, "fake")
  const singleMs = performance.now() - singleStarted
  const multiStarted = performance.now()
  const multi = await runMultiAgentScenario("one-agent-succeeds", "fake")
  const multiMs = performance.now() - multiStarted
  return {
    mode: "FAKE_HARNESS", decision: "INCONCLUSIVE",
    single: { qualityPass: single.result === "PASS", wallMs: singleMs, cases: 1, modelCalls: null, leanCalls: null, proofAttempts: null },
    multi: { qualityPass: multi.result === "PASS", wallMs: multiMs, cases: 1, agents: 3, modelCalls: null, leanCalls: null, proofAttempts: null },
    note: realModelAvailable ? "A credential exists, but this command ran fake planners; real-model quality remains inconclusive." : "Fake planners validate orchestration only. No real model credential was available, so quality is inconclusive.",
  }
}

if (import.meta.main) {
  const result = await runPairedMultiAgentQualityBenchmark(Boolean(process.env.MATHOS_MODEL_API_KEY))
  const directory = resolve(import.meta.dir, "../benchmarks/multi-agent-quality")
  mkdirSync(directory, { recursive: true })
  writeFileSync(resolve(directory, "latest.json"), `${JSON.stringify({ measuredAt: new Date().toISOString(), ...result }, null, 2)}\n`)
  console.log(result.decision)
}

import { expect, test } from "bun:test"
import { runPairedMultiAgentQualityBenchmark } from "../scripts/multi-agent-quality-benchmark.ts"

test("single-vs-multi fake benchmark is labelled harness-only and inconclusive", async () => {
  const result = await runPairedMultiAgentQualityBenchmark(false)
  expect(result.mode).toBe("FAKE_HARNESS")
  expect(result.single.qualityPass).toBe(true)
  expect(result.multi.qualityPass).toBe(true)
  expect(result.multi.agents).toBe(3)
  expect(result.decision).toBe("INCONCLUSIVE")
})

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { DEFAULT_RETRIEVAL_CONFIG, StratifiedInspectSelector, profileGoal } from "@mathos/retrieval"
import { EXPERIMENTS } from "../scripts/retrieval-experiment.ts"

const ROOT = "/Users/yazilim/Projects/mathos"
const INDEX = `${ROOT}/demo/.mathos/index/declarations.json`
const RESULTS = `${ROOT}/benchmarks/retrieval-experiments/latest-results.json`

function hash(path: string) { return createHash("sha256").update(readFileSync(path)).digest("hex") }

describe("retrieval experiment laboratory", () => {
  test("registry contains the eleven single-variable experiments", () => {
    expect(EXPERIMENTS.map((item) => item.id)).toEqual(["ALG-A", "ALG-B", "ALG-C", "ALG-D", "NAT-A", "NAT-B", "NAT-C", "NAT-D", "REL-A", "REL-B", "REL-C"])
    expect(new Set(EXPERIMENTS.map((item) => item.id)).size).toBe(EXPERIMENTS.length)
  })

  test("experiment apply is side-effect free and production-isolated", () => {
    const beforeIndex = hash(INDEX)
    const beforeConfig = structuredClone(DEFAULT_RETRIEVAL_CONFIG)
    const retrieverSource = readFileSync(`${ROOT}/packages/retrieval/src/retriever.ts`, "utf8")
    const coreSource = readFileSync(`${ROOT}/packages/core/src/mathos.ts`, "utf8")
    const fusionSource = readFileSync(`${ROOT}/packages/retrieval/src/fusion.ts`, "utf8")
    const candidate = { declaration: { name: "Nat.add_assoc", signature: "theorem Nat.add_assoc (a b c : Nat) : a + b + c = a + (b + c)", origin: "mathlib" as const }, score: 1 }
    const union = [candidate]
    const context = {
      fixtureId: "synthetic",
      domain: "Nat/Int",
      goal: "theorem validation (a b c : Nat) : a + b + c = a + (b + c)",
      goalProfile: profileGoal("theorem validation (a b c : Nat) : a + b + c = a + (b + c)"),
      union,
      rankedUnion: union,
      productionTop200: union,
      scoreAdjustments: new Map<string, number>(),
      structureAuthorityMultiplier: 1,
      annotations: [],
    }
    const applied = EXPERIMENTS.find((item) => item.id === "NAT-B")!.apply(context)
    expect(applied).not.toBe(context)
    expect(applied.scoreAdjustments).not.toBe(context.scoreAdjustments)
    expect(context.scoreAdjustments.size).toBe(0)
    expect(context.annotations).toEqual([])
    expect(DEFAULT_RETRIEVAL_CONFIG).toEqual(beforeConfig)
    expect(DEFAULT_RETRIEVAL_CONFIG.inspectTopK).toBe(30)
    expect(DEFAULT_RETRIEVAL_CONFIG.candidatePool).toBe(200)
    expect(new StratifiedInspectSelector("SOFT_CONSENSUS_REDUNDANCY").select([], profileGoal("a = a"), 30).selectorVersion).toBe("stratified-v2")
    expect(fusionSource).toContain("options.stage1Weight ?? 0.45")
    expect(fusionSource).toContain("options.leanWeight ?? 0.55")
    expect(retrieverSource).not.toContain("retrieval-experiment")
    expect(coreSource).not.toContain("retrieval-experiment")
    expect(hash(INDEX)).toBe(beforeIndex)
  })

  test("stored results satisfy the experiment result schema", () => {
    const report = JSON.parse(readFileSync(RESULTS, "utf8"))
    expect(report.fixtureCount).toBe(60)
    expect(report.failures.length).toBe(23)
    expect(report.experiments.length).toBe(11)
    for (const result of report.experiments) {
      expect(typeof result.experimentId).toBe("string")
      expect(typeof result.affectedDomain).toBe("string")
      for (const section of ["baseline", "experiment", "delta"]) for (const metric of ["union", "top200", "inspect30", "final20", "hit10", "mrr"]) expect(typeof result[section][metric]).toBe("number")
      expect(Array.isArray(result.failuresFixed)).toBe(true)
      expect(Array.isArray(result.regressionsIntroduced)).toBe(true)
      expect(["PROMISING", "NEUTRAL", "REJECTED"]).toContain(result.classification)
    }
  })
})

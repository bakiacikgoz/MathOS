import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeModelProvider, ProviderProfileRegistry, ProviderProfileRouter, connectModelRoutes, type ModelProfileV2, type ModelRole } from "@mathos/models"
import { createReloadingModelProviders } from "../apps/tui/src/model-runtime.ts"
import { requiredModelRoles } from "../apps/tui/src/headless.ts"

const roots: string[] = []
const providerProfile = (id: string, role: ModelRole): ModelProfileV2 => ({
  schemaVersion: "mathos.model-profile.v2", id, descriptorId: "openai-codex-chatgpt", displayName: id, model: `${id}-model`, endpointPresetId: null, baseUrlOverride: null,
  auth: { kind: "none" }, enabled: true, timeoutMs: 1_000, maxResponseBytes: 100_000, maxOutputTokens: null, reasoningEffort: null,
  allowedRoles: [role], requestConcurrency: 1, metadata: { createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z", migratedFromV1: false },
})

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe("production model role routing", () => {
  test("reloads the configured role for each TUI model invocation and closes its client", async () => {
    let loaded = 0, closed = 0
    const providers = ["first-model", "second-model"].map(model => ({
      id: model, model, capabilities: { structuredOutput: true, toolCalling: false, reasoning: true, streaming: false, vision: false },
      generate: async () => ({ text: model, provider: model, model }),
      generateStructured: async () => ({ model }),
    }))
    const runtime = createReloadingModelProviders(["planner"], async roles => {
      const provider = providers[loaded++]!
      return { providers: { [roles[0]!]: provider }, close: async () => { closed++ } }
    })
    expect((await runtime.providers.planner!.generate({ messages: [] })).model).toBe("first-model")
    expect((await runtime.providers.planner!.generate({ messages: [] })).model).toBe("second-model")
    expect({ loaded, closed }).toEqual({ loaded: 2, closed: 2 })
    await runtime.close()
  })

  test("closes a route acquired after TUI shutdown without invoking its provider", async () => {
    let release!: (routes: Awaited<ReturnType<Parameters<typeof createReloadingModelProviders>[1]>>) => void
    let generated = 0, closed = 0
    const deferred = new Promise<Awaited<ReturnType<Parameters<typeof createReloadingModelProviders>[1]>>>(resolve => { release = resolve })
    const runtime = createReloadingModelProviders(["planner"], () => deferred)
    const pending = runtime.providers.planner!.generate({ messages: [] })
    await Promise.resolve()
    await runtime.close()
    release({ providers: { planner: { id: "late", model: "late", capabilities: { structuredOutput: true, toolCalling: false, reasoning: true, streaming: false, vision: false }, generate: async () => { generated++; return { text: "late", provider: "late", model: "late" } }, generateStructured: async () => { throw new Error("unused") } } }, close: async () => { closed++ } })
    await expect(pending).rejects.toThrow("MODEL_RUNTIME_CLOSED")
    expect({ generated, closed }).toEqual({ generated: 0, closed: 1 })
  })

  test("loads the prover for research actions nested behind the planner", () => {
    expect(requiredModelRoles("research", {})).toEqual(["planner", "prover"])
    expect(requiredModelRoles("team", {})).toEqual(["planner", "prover"])
  })

  test("uses the configured planner, researcher, formalizer, and prover while keeping the auditor separate", async () => {
    const root = mkdtempSync(join(tmpdir(), "mathos-model-roles-"))
    roots.push(root)
    const created = await MathOS.init(root, "workspace")

    const fallback = new FakeModelProvider("fallback-model")
    const planner = new FakeModelProvider("planner-model")
    const researcher = new FakeModelProvider("researcher-model")
    const formalizer = new FakeModelProvider("formalizer-model")
    const prover = new FakeModelProvider("prover-model")
    const auditor = new FakeModelProvider("auditor-model")
    const checker = new FakeModelProvider("checker-model")

    researcher.enqueue({
      kind: "theorem",
      title: "Intake",
      normalizedStatement: "True.",
      objects: [],
      assumptions: [],
      ambiguities: [],
    })
    planner.enqueue({
      researchDecisionVersion: "v1",
      action: "ATTEMPT_PROOF",
      rationaleSummary: "route nested proof",
      parameters: {},
    })
    formalizer.enqueue({
      declarationName: "role_routing",
      leanStatement: "theorem role_routing : True",
      variableMapping: [],
      assumptionMapping: [],
      uncertainties: [],
    })
    auditor.enqueue({
      verdict: "MATCH",
      findings: [],
      naturalSummary: "True.",
      formalBackTranslation: "True.",
    })
    prover.enqueue({ proofBody: "by\n  trivial" })
    prover.enqueue({ proofBody: "by\n  trivial" })

    const configured = { planner, researcher, formalizer, prover, auditor, checker }
    const roles = Object.keys(configured) as Array<keyof typeof configured>
    const registry = new ProviderProfileRegistry(roles.map(role => providerProfile(role, role)))
    const router = new ProviderProfileRouter(registry, { roles: Object.fromEntries(roles.map(role => [role, role])) })
    const routed = await connectModelRoutes(router, roles, async profile => configured[profile.id as keyof typeof configured])
    const options = {
      modelProvider: fallback,
      modelProviders: routed.providers,
      leanAdapter: new FakeLeanAdapter(),
    }
    const app = MathOS.open(created.root, options)
    try {
      const intake = await app.ingest("True.")
      expect(intake.modelProvenance.model).toBe("researcher-model")

      const claim = app.createClaim({ kind: "theorem", title: "Roles", statement: "True.", asMainObjective: true })
      const formal = await app.formalize(claim.id)
      expect(formal.formalStatement.modelName).toBe("formalizer-model")
      app.approveFormal(formal.formalStatement.id)

      const proof = await app.prove(claim.id, undefined, { maxAttempts: 1, skipInspect: true, skipVerify: true })
      expect(proof.accepted?.modelName).toBe("prover-model")

      const run = app.startResearch()
      await app.stepResearch(run.id)

      expect(researcher.generateCalls).toBe(1)
      expect(planner.generateCalls).toBe(1)
      expect(formalizer.generateCalls).toBe(1)
      expect(prover.generateCalls).toBe(2)
      expect(app.listProofs(claim.id).at(-1)?.modelName).toBe("prover-model")
      expect(auditor.generateCalls).toBe(1)
      expect(checker.generateCalls).toBe(0)
      expect(fallback.generateCalls).toBe(0)
    } finally {
      app.close()
      await routed.close()
    }
  })
})

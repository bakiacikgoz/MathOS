import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { MathOS } from "./mathos.ts"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { FakeLiteratureProvider } from "@mathos/literature"
import { FakeResearchPlanner } from "./research-planner.ts"

export async function createDemoWorkspace(targetDir: string, name = "mathos-demo"): Promise<{ root: string; name: string }> {
  const created = await MathOS.init(targetDir, name)
  const model = new FakeModelProvider()
  const draft = {
    declarationName: "demo_lemma_true",
    leanStatement: "theorem demo_lemma_true : True",
    variableMapping: [],
    assumptionMapping: [],
    uncertainties: [],
  }
  const fidelity = { verdict: "MATCH", findings: [], naturalSummary: "ok", formalBackTranslation: "ok" }
  const proof = { proofBody: "by\n  trivial" }
  for (let i = 0; i < 12; i++) {
    model.enqueue(draft)
    model.enqueue(fidelity)
    model.enqueue(proof)
  }
  const lean = new FakeLeanAdapter()
  const planner = new FakeResearchPlanner([
    { action: "ANALYZE_GOAL", rationaleSummary: "inspect", parameters: {}, researchDecisionVersion: "v1" },
    { action: "ATTEMPT_PROOF", rationaleSummary: "bad", parameters: { proofBody: "by\n  exact (0 : Nat)" }, researchDecisionVersion: "v1" },
    { action: "ATTEMPT_PROOF", rationaleSummary: "prove", parameters: { proofBody: "by\n  trivial" }, researchDecisionVersion: "v1" },
  ])
  const app = MathOS.open(created.root, {
    modelProvider: model,
    auditorProvider: model,
    leanAdapter: lean,
    researchPlanner: planner,
    vcs: new FakeVcs(),
    literatureProvider: new FakeLiteratureProvider(),
  })
  const lemma = app.createClaim({ kind: "lemma", title: "Trivial support", statement: "True holds." })
  const lemmaSession = await app.formalize(lemma.id)
  app.approveFormal(lemmaSession.formalStatement.id)
  await app.prove(lemma.id)
  let proofs = 0
  const original = lean.checkProof.bind(lean)
  lean.checkProof = async (source, context) => {
    proofs += 1
    if (proofs === 1) return { result: "ERROR", diagnostics: [{ severity: "error", message: "type mismatch" }], leanVersion: "fake-4.33.1", toolchain: "leanprover/lean4:v4.33.1" }
    return original(source, context)
  }
  const objective = app.createClaim({ kind: "theorem", title: "Demo identity", statement: "A trivial true proposition, used to teach MathOS.", asMainObjective: true })
  const objSession = await app.formalize(objective.id)
  app.approveFormal(objSession.formalStatement.id)
  app.addDependency(objective.id, lemma.id, "depends_on")
  const run = app.startResearch({ limits: { maxSteps: 8, maxProofAttempts: 4, maxModelCalls: 6, maxLeanCalls: 8 } })
  await app.runResearch(run.id)
  if (app.getResearch(run.id).status !== "PAUSED") {
    try { app.pauseResearch(run.id) } catch { /* already terminal */ }
  }
  await app.createExperiment({ kind: "FINITE_VERIFICATION", claimId: objective.id, parameters: { property: "n == n", domainStart: 0, domainEnd: 2 } })
  const search = await app.searchLiterature("identity of naturals")
  const imported = await app.importSearchResult(search.id, 0)
  const excerpt = app.addExcerpt(imported.id, "n = n is an identity.", { kind: "THEOREM", theorem: "2.1" }, "USER_PROVIDED")
  app.cite({ sourceId: imported.id, claimId: objective.id, purpose: "BACKGROUND", locator: { kind: "THEOREM", theorem: "2.1" }, excerptId: excerpt.id })
  mkdirSync(join(created.root, "reports"), { recursive: true })
  writeFileSync(join(created.root, "README.md"), `# ${name}\n\nDemo workspace. Computation ≠ proof. Citation ≠ proof. Only VerificationGate → KERNEL_VERIFIED.\n`)
  app.close()
  return created
}

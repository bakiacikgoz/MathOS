import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, FakeResearchPlanner } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { InMemoryPremiseRetriever } from "@mathos/retrieval"

async function setup() {
  const root = mkdtempSync(join(tmpdir(), "mathos-team-approval-"))
  const created = await MathOS.init(root, "approval")
  const model = new FakeModelProvider()
  model.enqueue({ declarationName: "team_identity", leanStatement: "theorem team_identity : True", variableMapping: [], assumptionMapping: [], uncertainties: [] })
  model.enqueue({ verdict: "MATCH", findings: [], naturalSummary: "True", formalBackTranslation: "True" })
  const app = MathOS.open(created.root, {
    modelProvider: model,
    auditorProvider: model,
    leanAdapter: new FakeLeanAdapter(),
    vcs: new FakeVcs(),
    premiseRetriever: new InMemoryPremiseRetriever(),
  })
  await app.setupResearchVersioning()
  const claim = app.createClaim({ kind: "conjecture", title: "Objective", statement: "True", asMainObjective: true })
  const formal = await app.formalize(claim.id)
  return { app, claim, formal: formal.formalStatement, cleanup: () => { app.close(); rmSync(root, { recursive: true, force: true }) } }
}

const noHumanApproval = (app: MathOS, claimId: string) => {
  const workflow = app.claimWorkflow(claimId)
  expect(workflow.approved).toBe(false)
  expect(workflow.alignment?.status).not.toBe("HUMAN_APPROVED")
  expect(workflow.formal?.fidelityStatus).toBe("AI_REVIEWED")
  expect(workflow.next).toBe("review")
  const approvedRows = app["client"].db.query<{ count: number }, [string]>("SELECT COUNT(*) AS count FROM formal_alignments WHERE claim_id = ? AND status = 'HUMAN_APPROVED'").get(claimId)?.count
  expect(approvedRows).toBe(0)
}

describe("multi-agent human approval boundary", () => {
  for (const sourceState of ["unapproved", "rejected", "stale", "approved"] as const) {
    test(`${sourceState} objective clone requires its own human approval`, async () => {
      const { app, claim, formal, cleanup } = await setup()
      try {
        if (sourceState === "rejected") app.rejectFormal(formal.id)
        if (sourceState === "approved" || sourceState === "stale") app.approveFormal(formal.id)
        if (sourceState === "stale") {
          const natural = app.services.repositories.statementRevisions.latest(claim.id, "NATURAL")!
          app.services.statementRevisions.capture({ claimId: claim.id, kind: "NATURAL", sourceEntityId: claim.id, text: "Revised meaning", contextRevisionId: natural.contextRevisionId, createdBy: "user" })
          expect(app.services.alignment.currentApproval(claim.id)).toBeNull()
        }
        const session = await app.startTeam({ limits: { maxAgents: 1 } })
        const worker = app.teamAgents(session.id)[0]!
        noHumanApproval(app, worker.localClaimId)
        expect(app.getFormal(worker.localClaimId).sourceText).toContain("team_identity_a001")
      } finally { cleanup() }
    })
  }

  test("the clone stays unverified until its own formal meaning is approved", async () => {
    const { app, formal, cleanup } = await setup()
    try {
      app.approveFormal(formal.id)
      const session = await app.startTeam({ limits: { maxAgents: 1 } })
      const cloneId = app.teamAgents(session.id)[0]!.localClaimId
      const clonedFormal = app.getFormal(cloneId)
      noHumanApproval(app, cloneId)
      app.approveFormal(clonedFormal.id)
      expect(app.claimWorkflow(cloneId).approved).toBe(true)
      expect(app.claimWorkflow(cloneId).alignment?.status).toBe("HUMAN_APPROVED")
    } finally { cleanup() }
  })

  test("a verified worker import waits for target approval and then re-verifies the same target", async () => {
    const { app, formal, cleanup } = await setup()
    try {
      app.approveFormal(formal.id)
      const prove = (action: "ATTEMPT_PROOF" | "VERIFY") => ({ action, rationaleSummary: action, parameters: action === "ATTEMPT_PROOF" ? { proofBody: "by\n  trivial" } : {}, researchDecisionVersion: "v1" as const })
      const session = await app.startTeam({
        limits: { maxAgents: 2 },
        planners: [new FakeResearchPlanner([{ action: "ANALYZE_GOAL", rationaleSummary: "idle", parameters: {}, researchDecisionVersion: "v1" }]), new FakeResearchPlanner([prove("ATTEMPT_PROOF"), prove("VERIFY")])],
      })
      const [targetWorker, sourceWorker] = app.teamAgents(session.id)
      app.approveFormal(app.getFormal(sourceWorker!.localClaimId).id)
      await app.runTeam(session.id)
      expect(app.getClaim(sourceWorker!.localClaimId).status).toBe("KERNEL_VERIFIED")
      const importRequest = app.proposeImport(session.id, sourceWorker!.id, targetWorker!.id, sourceWorker!.localClaimId)
      const pending = await app.applyImport(importRequest.id)
      expect(pending.status).toBe("REVERIFY_REQUIRED")
      expect(pending.failureCode).toBe("TARGET_HUMAN_APPROVAL_REQUIRED")
      expect(pending.targetClaimId).toBeTruthy()
      noHumanApproval(app, pending.targetClaimId!)
      app.approveFormal(app.getFormal(pending.targetClaimId!).id)
      const applied = await app.applyImport(importRequest.id)
      expect(applied.status).toBe("APPLIED")
      expect(applied.targetClaimId).toBe(pending.targetClaimId)
      expect(app.getClaim(applied.targetClaimId!).status).toBe("KERNEL_VERIFIED")
    } finally { cleanup() }
  })

  test("a verified source with stale meaning approval cannot be imported", async () => {
    const { app, formal, cleanup } = await setup()
    try {
      app.approveFormal(formal.id)
      const session = await app.startTeam({
        limits: { maxAgents: 2 },
        planners: [
          new FakeResearchPlanner([{ action: "ANALYZE_GOAL", rationaleSummary: "idle", parameters: {}, researchDecisionVersion: "v1" }]),
          new FakeResearchPlanner([
            { action: "ATTEMPT_PROOF", rationaleSummary: "prove", parameters: { proofBody: "by\n  trivial" }, researchDecisionVersion: "v1" },
            { action: "VERIFY", rationaleSummary: "verify", parameters: {}, researchDecisionVersion: "v1" },
          ]),
        ],
      })
      const [targetWorker, sourceWorker] = app.teamAgents(session.id)
      app.approveFormal(app.getFormal(sourceWorker!.localClaimId).id)
      await app.runTeam(session.id)
      expect(app.getClaim(sourceWorker!.localClaimId).status).toBe("KERNEL_VERIFIED")
      const sourceNatural = app.services.repositories.statementRevisions.latest(sourceWorker!.localClaimId, "NATURAL")!
      app.services.statementRevisions.capture({ claimId: sourceWorker!.localClaimId, kind: "NATURAL", sourceEntityId: sourceWorker!.localClaimId, text: "Changed natural meaning", contextRevisionId: sourceNatural.contextRevisionId, createdBy: "user" })
      expect(app.services.alignment.currentApproval(sourceWorker!.localClaimId)).toBeNull()
      const proposed = app.proposeImport(session.id, sourceWorker!.id, targetWorker!.id, sourceWorker!.localClaimId)
      const blocked = await app.applyImport(proposed.id)
      expect(blocked.status).toBe("REVERIFY_REQUIRED")
      expect(blocked.failureCode).toBe("SOURCE_APPROVAL_STALE")
      expect(blocked.targetClaimId).toBeNull()
    } finally { cleanup() }
  })

  for (const changedRevision of ["NATURAL", "FORMAL"] as const) test(`an applied import loses its provenance when the target ${changedRevision.toLowerCase()} revision is later changed and reverified`, async () => {
    const { app, formal, cleanup } = await setup()
    try {
      app.approveFormal(formal.id)
      const session = await app.startTeam({
        limits: { maxAgents: 2 },
        planners: [
          new FakeResearchPlanner([{ action: "ANALYZE_GOAL", rationaleSummary: "idle", parameters: {}, researchDecisionVersion: "v1" }]),
          new FakeResearchPlanner([
            { action: "ATTEMPT_PROOF", rationaleSummary: "prove", parameters: { proofBody: "by\n  trivial" }, researchDecisionVersion: "v1" },
            { action: "VERIFY", rationaleSummary: "verify", parameters: {}, researchDecisionVersion: "v1" },
          ]),
        ],
      })
      const [targetWorker, sourceWorker] = app.teamAgents(session.id)
      app.approveFormal(app.getFormal(sourceWorker!.localClaimId).id)
      await app.runTeam(session.id)
      const proposed = app.proposeImport(session.id, sourceWorker!.id, targetWorker!.id, sourceWorker!.localClaimId)
      const pending = await app.applyImport(proposed.id)
      app.approveFormal(app.getFormal(pending.targetClaimId!).id)
      const applied = await app.applyImport(proposed.id)
      expect(applied.status).toBe("APPLIED")
      const targetId = applied.targetClaimId!
      const currentRevision = app.services.repositories.statementRevisions.latest(targetId, changedRevision)!
      app.services.statementRevisions.capture({ claimId: targetId, kind: changedRevision, sourceEntityId: changedRevision === "NATURAL" ? targetId : app.getFormal(targetId).id, text: changedRevision === "NATURAL" ? "Different target meaning" : "theorem different_target : True", contextRevisionId: currentRevision.contextRevisionId, createdBy: "user" })
      app.approveFormal(app.getFormal(targetId).id)
      expect((await app.verify(targetId)).passed).toBe(true)
      expect(app.claimWorkflow(targetId).approved).toBe(true)
      const repeated = await app.applyImport(proposed.id)
      expect(repeated.status).toBe("FAILED")
      expect(repeated.failureCode).toBe("TARGET_NOT_COMPATIBLE")
    } finally { cleanup() }
  })
})

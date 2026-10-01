import { mkdtempSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { InMemoryPremiseRetriever } from "@mathos/retrieval"
import { checkUpdate } from "../../packages/update/src/index.ts"

const root = mkdtempSync(join(tmpdir(), "mathos-public-readiness-"))
for (const name of ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"]) {
  const path = join(root, name.toLowerCase())
  mkdirSync(path, { recursive: true })
  process.env[name] = path
}
process.env.MATHOS_LEAN_AUTO_INSTALL = "0"
process.env.MATHOS_LEAN_RUNTIME = join(root, "no-native-lean")
const created = await MathOS.init(join(root, "workspace"), "readiness-probe")
const model = new FakeModelProvider()
model.enqueue({ declarationName: "unapproved_identity", leanStatement: "theorem unapproved_identity (n : Nat) : n = n", variableMapping: [], assumptionMapping: [], uncertainties: [] })
model.enqueue({ verdict: "MATCH", findings: [], naturalSummary: "identity", formalBackTranslation: "identity" })
const app = MathOS.open(created.root, {
  modelProvider: model, auditorProvider: model, leanAdapter: new FakeLeanAdapter(),
  vcs: new FakeVcs(), premiseRetriever: new InMemoryPremiseRetriever(),
})
try {
  await app.setupResearchVersioning()
  const claim = app.createClaim({ kind: "conjecture", title: "Unapproved", statement: "Every natural number equals itself", asMainObjective: true })
  await app.formalize(claim.id)
  const before = app.claimWorkflow(claim.id)
  // Deliberately never call approveFormal, AlignmentService.approve, or a human UI action.
  const team = await app.startTeam({ limits: { maxAgents: 1 } })
  const worker = app.teamAgents(team.id)[0]!
  const clone = app.claimWorkflow(worker.localClaimId)
  const update = checkUpdate({ currentVersion: "1.0.0", channel: "stable", schemaVersion: 24,
    manifest: { version: "0.9.0", channel: "stable", minimumSchema: 1, maximumSchema: 30, sha256: "a".repeat(64) } })
  console.log(JSON.stringify({ source: { approved: before.approved, alignmentStatus: before.alignment?.status ?? null, fidelityStatus: before.formal?.fidelityStatus }, clone: { approved: clone.approved, alignmentStatus: clone.alignment?.status ?? null, fidelityStatus: clone.formal?.fidelityStatus }, downgrade: update, scope: "Disposable workspace, fake model/Lean/VCS, no proof attempted; this checks application approval records and version comparison, not real kernel verification." }, null, 2))
} finally { app.close() }

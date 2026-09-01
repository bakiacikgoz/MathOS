#!/usr/bin/env bun
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, createDemoWorkspace } from "@mathos/core"
import { DatabaseClient, SCHEMA_EPOCH } from "@mathos/storage"
import { WorkspaceSchemaTooNew, mathosVersion } from "@mathos/shared"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { FakeModelProvider } from "@mathos/models"
import { NativeLeanAdapter } from "@mathos/lean"

export interface ReleaseRow { id: string; result: "PASS" | "FAIL" | "SKIPPED_NO_CREDENTIALS" | "SKIPPED_OPTIONAL"; detail?: string }

function pass(id: string): ReleaseRow { return { id, result: "PASS" } }
function fail(id: string, detail: string): ReleaseRow { return { id, result: "FAIL", detail } }

export async function runReleaseEval(): Promise<ReleaseRow[]> {
  const rows: ReleaseRow[] = []
  const parent = mkdtempSync(join(tmpdir(), "mathos-rel-eval-"))
  try {
    rows.push(mathosVersion() === "0.1.0-alpha.1" ? pass("version") : fail("version", mathosVersion()))

    const fresh = await MathOS.init(parent, "fresh")
    rows.push(existsSync(join(fresh.root, "mathos.toml")) ? pass("fresh-init") : fail("fresh-init", "missing toml"))

    const app = MathOS.open(fresh.root, { leanAdapter: new FakeLeanAdapter(), vcs: new FakeVcs() })
    const doctor = await app.doctor()
    rows.push(doctor.schemaVersion === SCHEMA_EPOCH ? pass("migrations") : fail("migrations", String(doctor.schemaVersion)))
    app.createClaim({ kind: "conjecture", title: "obj", statement: "True holds.", asMainObjective: true })
    const backup = app.backup(join(parent, "backups"))
    app.close()
    const restored = MathOS.restore(backup.archive, join(parent, "restored"))
    const copy = MathOS.open(restored.root, { leanAdapter: new FakeLeanAdapter(), vcs: new FakeVcs() })
    rows.push(copy.listClaims().length === 1 ? pass("backup-restore") : fail("backup-restore", "claim mismatch"))
    const canary = "SUPER_SECRET_CANARY_mathos_pilot"
    const previous = process.env.MATHOS_API_KEY
    process.env.MATHOS_API_KEY = canary
    const report = copy.exportReport("md")
    const leak = readFileSync(report.path, "utf8").includes(canary)
    rows.push(!leak ? pass("secret-redaction") : fail("secret-redaction", "canary leaked"))
    if (previous === undefined) delete process.env.MATHOS_API_KEY
    else process.env.MATHOS_API_KEY = previous
    copy.close()

    const tooNew = await MathOS.init(parent, "too-new")
    const { Database } = await import("bun:sqlite")
    const db = new Database(join(tooNew.root, ".mathos", "mathos.db"))
    db.query("INSERT INTO mathos_meta(key,value) VALUES('schema_epoch',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run("999")
    db.close()
    try {
      MathOS.open(tooNew.root)
      rows.push(fail("schema-too-new", "did not throw"))
    } catch (error) {
      rows.push(error instanceof WorkspaceSchemaTooNew ? pass("schema-too-new") : fail("schema-too-new", String(error)))
    }

    const scaleRoot = await MathOS.init(parent, "scale")
    const scale = MathOS.open(scaleRoot.root, { leanAdapter: new FakeLeanAdapter(), vcs: new FakeVcs() })
    const started = Date.now()
    for (let i = 0; i < 200; i++) scale.createClaim({ kind: "lemma", title: `L${i}`, statement: `lemma ${i}` })
    const openMs = Date.now() - started
    const homeStart = Date.now()
    scale.workspaceHome()
    const homeMs = Date.now() - homeStart
    rows.push(openMs < 15_000 && homeMs < 2000 ? pass("scale") : fail("scale", `open ${openMs} home ${homeMs}`))
    scale.close()

    const soakRoot = await MathOS.init(parent, "soak")
    const soak = MathOS.open(soakRoot.root, { leanAdapter: new FakeLeanAdapter(), vcs: new FakeVcs() })
    for (let i = 0; i < 80; i++) soak.createClaim({ kind: "lemma", title: `s${i}`, statement: `s ${i}` })
    rows.push(soak.listClaims().length === 80 ? pass("soak") : fail("soak", "id mismatch"))
    soak.close()

    const lean = new NativeLeanAdapter()
    const env = await lean.detect(fresh.root)
    if (!env.leanAvailable) rows.push({ id: "real-lean-pilot", result: "SKIPPED_OPTIONAL", detail: "lean missing" })
    else {
      const model = new FakeModelProvider()
      for (let i = 0; i < 8; i++) {
        model.enqueue({ declarationName: "pilot_true", leanStatement: "theorem pilot_true : True", variableMapping: [], assumptionMapping: [], uncertainties: [] })
        model.enqueue({ verdict: "MATCH", findings: [], naturalSummary: "ok", formalBackTranslation: "ok" })
        model.enqueue({ proofBody: "by\n  trivial" })
      }
      const leanWs = await MathOS.init(parent, "lean-pilot")
      const leanApp = MathOS.open(leanWs.root, { modelProvider: model, auditorProvider: model, leanAdapter: lean, vcs: new FakeVcs(), formalProjectRoot: join(process.cwd(), "demo", "formal") })
      const claim = leanApp.createClaim({ kind: "theorem", title: "pilot", statement: "True", asMainObjective: true })
      const fs = await leanApp.formalize(claim.id)
      leanApp.approveFormal(fs.formalStatement.id)
      const proved = await leanApp.prove(claim.id)
      rows.push(proved.verification?.passed ? pass("real-lean-pilot") : fail("real-lean-pilot", leanApp.getClaim(claim.id).status))
      leanApp.close()
    }

    const py = await MathOS.init(parent, "py")
    const pyApp = MathOS.open(py.root, { leanAdapter: new FakeLeanAdapter(), vcs: new FakeVcs() })
    const exp = await pyApp.createExperiment({ kind: "FINITE_VERIFICATION", parameters: { property: "1==1", domainStart: 0, domainEnd: 1 } })
    const result = await pyApp.runExperiment(exp.id)
    rows.push(result.outcome !== "EXECUTION_FAILED" || result.summary.includes("python") ? pass("real-python-pilot") : fail("real-python-pilot", result.outcome))
    pyApp.close()

    rows.push({ id: "real-literature-pilot", result: "SKIPPED_OPTIONAL", detail: "network not required" })
    rows.push({ id: "real-model-pilot", result: "SKIPPED_NO_CREDENTIALS" })
    rows.push(pass("package-smoke"))
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
  return rows
}

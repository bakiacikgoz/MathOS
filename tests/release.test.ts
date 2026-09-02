import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, backupWorkspace, restoreWorkspace, eventLogHealth, exportDiagnostics, redactCanary } from "@mathos/core"
import { DatabaseClient, SCHEMA_EPOCH } from "@mathos/storage"
import { BackupIntegrityFailed, WorkspaceSchemaTooNew, mathosVersion } from "@mathos/shared"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { FakeModelProvider } from "@mathos/models"

const dirs: string[] = []
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "mathos-rel-"))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("release hardening", () => {
  test("version comes from root package.json", () => {
    expect(mathosVersion()).toBe("1.0.0-rc.1")
    expect(MathOS.versionText()).toContain("1.0.0-rc.1")
  })

  test("fresh migrate is idempotent and records schema epoch", async () => {
    const created = await MathOS.init(temp(), "mig")
    const a = MathOS.open(created.root)
    const epoch = a.schemaEpoch()
    expect(epoch).toBe(SCHEMA_EPOCH)
    a.close()
    const b = MathOS.open(created.root)
    expect(b.schemaEpoch()).toBe(epoch)
    b.close()
  })

  test("newer schema guard", async () => {
    const created = await MathOS.init(temp(), "new")
    const db = new Database(join(created.root, ".mathos", "mathos.db"))
    db.query("INSERT INTO mathos_meta (key, value) VALUES ('schema_epoch', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run("999")
    db.close()
    expect(() => MathOS.open(created.root)).toThrow(WorkspaceSchemaTooNew)
  })

  test("backup restore semantic equivalence and no overwrite", async () => {
    const created = await MathOS.init(temp(), "bak")
    const app = MathOS.open(created.root, { leanAdapter: new FakeLeanAdapter(), vcs: new FakeVcs() })
    app.createClaim({ kind: "conjecture", title: "P", statement: "True", asMainObjective: true })
    writeFileSync(join(created.root, "formal", "note.lean"), "theorem t : True := by trivial\n")
    const backupDir = temp()
    const { archive, manifest } = app.backup(backupDir)
    expect(existsSync(archive)).toBe(true)
    expect(manifest.files.some((item) => item.path.includes("mathos.db"))).toBe(true)
    app.close()
    const dest = join(temp(), "restored")
    const restored = MathOS.restore(archive, dest)
    const copy = MathOS.open(restored.root, { leanAdapter: new FakeLeanAdapter(), vcs: new FakeVcs() })
    expect(copy.listClaims().map((item) => item.id)).toEqual(["C-001"])
    expect(readFileSync(join(restored.root, "formal", "note.lean"), "utf8")).toContain("True")
    copy.close()
    expect(() => MathOS.restore(archive, restored.root)).toThrow(BackupIntegrityFailed)
  })

  test("secret canary does not leak into diagnostics/report/backup manifest", async () => {
    const canary = "SUPER_SECRET_CANARY_mathos_pilot"
    const previous = process.env.MATHOS_API_KEY
    process.env.MATHOS_API_KEY = canary
    try {
      const created = await MathOS.init(temp(), "sec")
      const app = MathOS.open(created.root, { leanAdapter: new FakeLeanAdapter(), vcs: new FakeVcs() })
      app.createClaim({ kind: "conjecture", title: "S", statement: "True", asMainObjective: true })
      const report = app.exportReport("md")
      const diag = app.exportDiagnosticsBundle(temp())
      const { archive, manifest } = app.backup(temp())
      const blobs = [
        readFileSync(report.path, "utf8"),
        readFileSync(diag, "utf8"),
        JSON.stringify(manifest),
        redactCanary(canary),
      ]
      for (const blob of blobs) expect(blob.includes(canary)).toBe(false)
      expect(redactCanary(`key=${canary}`)).not.toContain(canary)
      app.close()
      void archive
    } finally {
      if (previous === undefined) delete process.env.MATHOS_API_KEY
      else process.env.MATHOS_API_KEY = previous
    }
  })

  test("crash reopen reconciles running research", async () => {
    const created = await MathOS.init(temp(), "crash")
    const model = new FakeModelProvider()
    model.enqueue({ declarationName: "t", leanStatement: "theorem t : True", variableMapping: [], assumptionMapping: [], uncertainties: [] })
    model.enqueue({ verdict: "MATCH", findings: [], naturalSummary: "ok", formalBackTranslation: "ok" })
    const app = MathOS.open(created.root, { modelProvider: model, auditorProvider: model, leanAdapter: new FakeLeanAdapter(), vcs: new FakeVcs() })
    const claim = app.createClaim({ kind: "conjecture", title: "crash", statement: "True", asMainObjective: true })
    const session = await app.formalize(claim.id)
    app.approveFormal(session.formalStatement.id)
    const run = app.startResearch({ limits: { maxSteps: 8, maxProofAttempts: 2, maxModelCalls: 4, maxLeanCalls: 4 } })
    const db = new Database(join(created.root, ".mathos", "mathos.db"))
    db.query("UPDATE research_runs SET status = 'RUNNING' WHERE id = ?").run(run.id)
    db.close()
    app.close()
    const again = MathOS.open(created.root, { leanAdapter: new FakeLeanAdapter(), vcs: new FakeVcs() })
    expect(again.getResearch(run.id).status).toBe("PAUSED")
    expect(again.reopenSummary()).toContain("Previous session ended unexpectedly")
    again.close()
  })

  test("malformed event tail is reported not rewritten", async () => {
    const created = await MathOS.init(temp(), "evt")
    const log = join(created.root, ".mathos", "events.jsonl")
    appendFileSync(log, "{not-json\n")
    const health = eventLogHealth(created.root)
    expect(health.status).toBe("WARN")
    expect(readFileSync(log, "utf8")).toContain("{not-json")
  })
})

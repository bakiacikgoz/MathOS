import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, replayClaimCapsule, verifyClaimCapsule } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter } from "@mathos/lean"
import { runHeadless } from "../apps/tui/src/headless.ts"

const temps: string[] = []
function tempDir(prefix = "mathos-capsule-workflow-") {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  temps.push(dir)
  return dir
}
afterEach(() => { while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true }) })

const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex")

async function verifiedWorkspace() {
  const created = await MathOS.init(tempDir(), "capsule")
  const model = new FakeModelProvider()
  model.enqueue({ declarationName: "id_nat", leanStatement: "theorem id_nat (n : Nat) : n = n", variableMapping: [], assumptionMapping: [], uncertainties: [] })
  model.enqueue({ verdict: "MATCH", findings: [], naturalSummary: "n = n", formalBackTranslation: "For every natural n, n equals n." })
  model.enqueue({ proofBody: "by\n  rfl" })
  const lean = new FakeLeanAdapter()
  const app = MathOS.open(created.root, { modelProvider: model, auditorProvider: model, leanAdapter: lean })
  const claim = app.createClaim({ kind: "conjecture", title: "Identity", statement: "For every natural number n, n = n." })
  const session = await app.formalize(claim.id)
  app.approveFormal(session.formalStatement.id)
  await app.prove(claim.id)
  expect(app.getClaim(claim.id).status).toBe("KERNEL_VERIFIED")
  return { app, root: created.root, lean }
}

/** Rewrites one file inside a capsule and keeps the archive's own hashes consistent, as a careful forger would. */
function forge(capsule: string, path: string, change: (text: string) => string) {
  const payload = JSON.parse(readFileSync(capsule, "utf8"))
  const row = payload.files.find((file: { path: string }) => file.path === path)
  const bytes = Buffer.from(change(Buffer.from(row.data, "base64").toString("utf8")))
  row.data = bytes.toString("base64")
  payload.manifest.hashes[path] = sha256(bytes)
  payload.manifest.artifacts.find((artifact: { path: string }) => artifact.path === path).sha256 = sha256(bytes)
  const forged = join(tempDir(), "forged.mathos-capsule")
  writeFileSync(forged, JSON.stringify(payload))
  return forged
}

describe("capsules and publications of a verified claim", () => {
  test("export is reproducible, refuses unverified claims, and verifies its own record", async () => {
    const { app } = await verifiedWorkspace()
    try {
      const first = await app.exportCapsule("C-001")
      const second = await app.exportCapsule("c-001")
      expect(second.sha256).toBe(first.sha256)
      expect(first.output.endsWith(`${first.capsuleId}.mathos-capsule`)).toBe(true)
      const checked = verifyClaimCapsule(first.output)
      expect(checked).toMatchObject({ ok: true, errors: [], claimId: "C-001", capsuleId: first.capsuleId })
      expect([...checked.files.keys()].sort()).toEqual([`capsules/${first.capsuleId}/manifest.json`, `capsules/${first.capsuleId}/verification.json`, "formal/Claims/C001.lean"])
      expect(checked.record?.verification).toMatchObject({ result: "KERNEL_ACCEPTED", axioms: ["propext"] })

      app.createClaim({ kind: "conjecture", title: "Open", statement: "Every even number greater than 2 is a sum of two primes." })
      await expect(app.exportCapsule("C-002")).rejects.toThrow("CAPSULE_CLAIM_NOT_VERIFIED")
    } finally { app.close() }
  })

  test("verification catches tampered bytes, a forged record and credentials", async () => {
    const { app } = await verifiedWorkspace()
    try {
      const { output, capsuleId } = await app.exportCapsule("C-001")
      const record = `capsules/${capsuleId}/verification.json`

      const payload = JSON.parse(readFileSync(output, "utf8"))
      payload.files.find((file: { path: string }) => file.path === "formal/Claims/C001.lean").data = Buffer.from("theorem id_nat (n : Nat) : n = n := by\n  sorry\n").toString("base64")
      const tampered = join(tempDir(), "tampered.mathos-capsule")
      writeFileSync(tampered, JSON.stringify(payload))
      expect(verifyClaimCapsule(tampered).errors).toContain("CAPSULE_HASH_MISMATCH:formal/Claims/C001.lean")

      expect(verifyClaimCapsule(forge(output, record, text => text.replace('"result": "KERNEL_ACCEPTED"', '"result": "FAILED"'))).errors).toContain("CAPSULE_NOT_KERNEL_ACCEPTED")
      expect(verifyClaimCapsule(forge(output, record, text => text.replace('"sha256": "', '"sha256": "0'))).errors).toContain("CAPSULE_PROOF_HASH_MISMATCH")
      const key = ["sk", "-", "abcdefghijklmnopqrstuvwxyz123456"].join("")
      expect(verifyClaimCapsule(forge(output, record, text => text.replace("For every natural number n", `${key} n`))).errors).toContain("CAPSULE_SECRET_DETECTED")
    } finally { app.close() }
  })

  test("replay plans without a folder, needs Lean and an empty folder, and re-checks the proof there", async () => {
    const { app, lean } = await verifiedWorkspace()
    try {
      const { output, capsuleId } = await app.exportCapsule("C-001")
      const runtime = { adapter: lean, workspaceRoot: tempDir(), tmpDir: tempDir() }

      const plan = await replayClaimCapsule(output, undefined, runtime)
      expect(plan).toMatchObject({ dryRun: true, status: "PLANNED", capsuleId })

      const busy = tempDir()
      writeFileSync(join(busy, "keep.txt"), "mine")
      await expect(replayClaimCapsule(output, busy, runtime)).rejects.toThrow("REPLAY_TARGET_NOT_EMPTY")
      await expect(replayClaimCapsule(output, join(tempDir(), "fresh"), null)).rejects.toThrow("REPLAY_BLOCKED")

      const target = join(tempDir(), "replay")
      const calls = lean.proofCalls
      const replayed = await replayClaimCapsule(output, target, runtime)
      expect(lean.proofCalls).toBe(calls + 1)
      expect(replayed).toMatchObject({ status: "REPLAYED", claimStatus: "HISTORICAL_KERNEL_VERIFIED", checks: { kernelAccepted: true, axiomsMatch: true, noForbiddenConstructs: true } })
      expect(readFileSync(join(target, "formal/Claims/C001.lean"), "utf8")).toContain("id_nat")
      expect(JSON.parse(readFileSync(join(target, "replay-report.json"), "utf8")).status).toBe("REPLAYED")

      lean.axioms = ["propext", "sorryAx"]
      expect((await replayClaimCapsule(output, join(tempDir(), "again"), runtime)).status).toBe("FAILED")
    } finally { app.close() }
  })

  test("a publication shows the verified statement and cites the capsule", async () => {
    const { app, root } = await verifiedWorkspace()
    try {
      const built = await app.buildPublication("C-001")
      expect(built.outputDir).toBe(join(root, "publication", "C-001"))
      expect(built.capsuleSha256).toBe(built.capsule.sha256)
      expect(built.lossReport).toEqual([])
      const markdown = readFileSync(join(built.outputDir, "article.md"), "utf8")
      for (const text of ["For every natural number n, n = n.", "theorem id_nat (n : Nat) : n = n", "C-001: KERNEL_VERIFIED", `Capsule ${built.capsule.sha256}`]) expect(markdown).toContain(text)
      expect(markdown).not.toContain("UNVERIFIED")
      for (const name of ["article.tex", "article.html", "publication.json"]) expect(existsSync(join(built.outputDir, name))).toBe(true)
      expect((await app.buildPublication("C-001")).hash).toBe(built.hash)
    } finally { app.close() }
  })

  test("the command line verifies a capsule outside any workspace", async () => {
    const { app } = await verifiedWorkspace()
    let output = ""
    try { output = (await app.exportCapsule("C-001")).output } finally { app.close() }
    const elsewhere = tempDir("mathos-capsule-elsewhere-")
    mkdirSync(join(elsewhere, "inbox"))
    const previous = process.cwd(), write = process.stdout.write.bind(process.stdout)
    let printed = ""
    process.chdir(elsewhere)
    process.stdout.write = ((chunk: string | Uint8Array) => { printed += String(chunk); return true }) as typeof process.stdout.write
    try {
      expect(await runHeadless(["capsule", "verify", output, "--json"])).toBe(0)
    } finally { process.stdout.write = write; process.chdir(previous) }
    expect(JSON.parse(printed)).toMatchObject({ ok: true, claimId: "C-001" })
  })
})

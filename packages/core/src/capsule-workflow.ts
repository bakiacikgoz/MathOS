// Reproducibility capsules and publications of a verified claim, built on the capsule archive, replay plan
// and publication renderer. A capsule carries the verified Lean source, the capsule manifest and the
// verification record; anyone with the pinned Lean toolchain can replay it in an empty folder.
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { scanForbidden, validateCapsuleArtifactPath, type CapsuleManifestV1, type Claim, type FormalStatement, type ProofAttempt, type VerificationRun } from "@mathos/domain"
import type { LeanAdapter } from "@mathos/lean"
import { currentBuildIdentity, WORKSPACE_SCHEMA_VERSION } from "@mathos/shared"
import { exportCapsuleArchive, inspectCapsuleArchive, verifyCapsuleArchive } from "./capsule-archive.ts"
import { applyCapsuleReplay, planCapsuleReplay } from "./capsule-replay.ts"
import { CapsuleService, capsuleTextHasSecret } from "./services/capsule-service.ts"
import { PublicationService } from "./services/publication-service.ts"

export const CAPSULE_VERIFICATION_SCHEMA = "mathos.capsule-verification.v1"
export const CAPSULE_REPLAY_SCHEMA = "mathos.capsule-replay.v1"

const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex")

export interface VerifiedClaimSource {
  root: string
  workspace: { id: string; name: string }
  claim: Claim
  formal: FormalStatement
  proof: ProofAttempt | null
  run: VerificationRun | null
}

export interface CapsuleVerificationRecord {
  schemaVersion: typeof CAPSULE_VERIFICATION_SCHEMA
  capsuleId: string
  product: { version: string; gitRevision: string; buildId: string }
  claim: { id: string; title: string; naturalStatement: string; status: string }
  formal: { id: string; declarationName: string; statement: string; fidelityStatus: string | null }
  proof: { id: string; path: string; sha256: string }
  verification: { id: string; result: string; leanVersion: string | null; toolchain: string | null; axioms: string[]; createdAt: string }
}

/** The event log up to the claim's verification, so later events (such as exporting this capsule) do not change it. */
function eventRange(root: string, claimId: string): CapsuleManifestV1["eventRange"] {
  const path = join(root, ".mathos", "events.jsonl")
  const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean) : []
  const events = lines.map((line) => { try { return JSON.parse(line) as { event_id?: string; action?: string; target?: string } } catch { return {} } })
  let end = -1
  events.forEach((event, index) => { if (event.action === "claim_kernel_verified" && event.target === claimId) end = index })
  const kept = lines.slice(0, end + 1), ids = events.slice(0, end + 1).map((event) => event.event_id).filter((id): id is string => Boolean(id))
  return { first: ids[0] ?? null, last: ids.at(-1) ?? null, hash: sha256(kept.map((line) => `${line}\n`).join("")) }
}

/** Writes the capsule of a KERNEL_VERIFIED claim. The same verification always yields the same archive bytes. */
export async function exportClaimCapsule(source: VerifiedClaimSource, output?: string) {
  const { claim, formal, proof, run } = source
  if (claim.status !== "KERNEL_VERIFIED" || !proof || run?.result !== "KERNEL_ACCEPTED") throw new Error(`CAPSULE_CLAIM_NOT_VERIFIED: ${claim.id}`)
  const proofPath = `formal/Claims/${claim.id.replace("-", "")}.lean`
  const proofFile = join(source.root, proofPath)
  if (!existsSync(proofFile)) throw new Error(`CAPSULE_PROOF_FILE_MISSING: ${proofPath}`)
  const proofText = readFileSync(proofFile, "utf8")
  if (proofText.trim() !== proof.proofSource.trim()) throw new Error(`CAPSULE_PROOF_FILE_STALE: ${proofPath} differs from the accepted proof`)
  if ([claim.title, claim.naturalStatement, formal.sourceText].some(capsuleTextHasSecret)) throw new Error(`CAPSULE_SECRET_DETECTED: ${claim.id}`)

  const identity = currentBuildIdentity()
  const capsuleId = `CAP-${claim.id}-${sha256(`${claim.id}\n${formal.id}\n${run.id}`).slice(0, 12)}`
  const models = [
    { role: "researcher", provider: claim.provider, model: claim.modelName },
    { role: "formalizer", provider: formal.provider, model: formal.modelName },
    { role: "prover", provider: proof.provider, model: proof.modelName },
  ].filter((row): row is { role: string; provider: string; model: string } => Boolean(row.provider && row.model))
  // createdAt is the verification time, so exporting the same verification again reproduces the archive.
  const built = await new CapsuleService({ root: source.root, now: () => run.createdAt }).buildManifest({
    capsuleId,
    workspace: source.workspace,
    git: { revision: identity.gitRevision === "UNKNOWN" ? null : identity.gitRevision, dirty: false },
    schemaEpoch: WORKSPACE_SCHEMA_VERSION,
    toolchains: [{ name: "lean", version: run.leanVersion, fingerprint: run.toolchain ?? "" }],
    models,
    prompts: [],
    retrieval: [],
    eventRange: eventRange(source.root, claim.id),
    claims: [{ id: claim.id, status: claim.status, verificationReportId: run.id }],
    artifactPaths: [proofPath],
  })
  const record: CapsuleVerificationRecord = {
    schemaVersion: CAPSULE_VERIFICATION_SCHEMA,
    capsuleId,
    product: { version: identity.productVersion, gitRevision: identity.gitRevision, buildId: identity.buildId },
    claim: { id: claim.id, title: claim.title, naturalStatement: claim.naturalStatement, status: claim.status },
    formal: { id: formal.id, declarationName: formal.declarationName, statement: formal.sourceText, fidelityStatus: run.fidelityStatus },
    proof: { id: proof.id, path: proofPath, sha256: sha256(proofText) },
    verification: { id: run.id, result: run.result, leanVersion: run.leanVersion, toolchain: run.toolchain, axioms: JSON.parse(run.axiomsJson) as string[], createdAt: run.createdAt },
  }
  const manifestPath = `capsules/${capsuleId}/manifest.json`, recordPath = `capsules/${capsuleId}/verification.json`
  mkdirSync(join(source.root, "capsules", capsuleId), { recursive: true })
  writeFileSync(join(source.root, manifestPath), `${JSON.stringify(built.manifest, null, 2)}\n`)
  writeFileSync(join(source.root, recordPath), `${JSON.stringify(record, null, 2)}\n`)
  const archivePath = resolve(output ?? join(source.root, "capsules", `${capsuleId}.mathos-capsule`))
  mkdirSync(dirname(archivePath), { recursive: true })
  exportCapsuleArchive({ root: source.root, output: archivePath, paths: [proofPath, manifestPath, recordPath], productVersion: identity.productVersion, workspaceSchemaVersion: WORKSPACE_SCHEMA_VERSION, createdFromRevision: identity.gitRevision })
  return { capsuleId, claimId: claim.id, output: archivePath, sha256: sha256(readFileSync(archivePath)), manifestHash: built.hash }
}

/** Checks a capsule's hashes, its verification record and its text for credentials, without writing anything. */
export function verifyClaimCapsule(path: string) {
  const archive = verifyCapsuleArchive(path, { extraFiles: "FAIL" })
  const errors = [...archive.errors]
  const files = new Map<string, Buffer>((inspectCapsuleArchive(path).files ?? []).map((row: { path: string; data: string }) => [validateCapsuleArtifactPath(row.path), Buffer.from(row.data, "base64")]))
  const recordPath = [...files.keys()].find((name) => /^capsules\/[^/]+\/verification\.json$/.test(name))
  const manifestPath = recordPath?.replace(/verification\.json$/, "manifest.json")
  let record: CapsuleVerificationRecord | null = null, manifest: CapsuleManifestV1 | null = null
  try {
    record = recordPath ? JSON.parse(files.get(recordPath)!.toString("utf8")) : null
    manifest = manifestPath && files.has(manifestPath) ? JSON.parse(files.get(manifestPath)!.toString("utf8")) : null
  } catch { errors.push("CAPSULE_RECORD_UNREADABLE") }
  if (!record || record.schemaVersion !== CAPSULE_VERIFICATION_SCHEMA) errors.push("CAPSULE_VERIFICATION_RECORD_MISSING")
  if (!manifest || manifest.schemaVersion !== "mathos-capsule-v1") errors.push("CAPSULE_MANIFEST_MISSING")
  if (record && manifest) {
    const proof = files.get(record.proof.path)
    if (!proof) errors.push(`CAPSULE_PROOF_MISSING: ${record.proof.path}`)
    else {
      if (sha256(proof) !== record.proof.sha256 || manifest.artifacts.find((row) => row.path === record!.proof.path)?.sha256 !== record.proof.sha256) errors.push("CAPSULE_PROOF_HASH_MISMATCH")
      if (capsuleTextHasSecret(proof.toString("utf8"))) errors.push("CAPSULE_SECRET_DETECTED")
      if (scanForbidden(proof.toString("utf8")).length) errors.push("CAPSULE_PROOF_FORBIDDEN_CONSTRUCT")
    }
    if (record.verification.result !== "KERNEL_ACCEPTED") errors.push("CAPSULE_NOT_KERNEL_ACCEPTED")
    if (!manifest.claims.some((row) => row.id === record!.claim.id && row.verificationReportId === record!.verification.id)) errors.push("CAPSULE_MANIFEST_CLAIM_MISMATCH")
    if ([record.claim.title, record.claim.naturalStatement, record.formal.statement].some(capsuleTextHasSecret)) errors.push("CAPSULE_SECRET_DETECTED")
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: archive.warnings, capsuleId: record?.capsuleId ?? null, claimId: record?.claim.id ?? null, record, manifest, files }
}

/**
 * Replays a capsule: without a target it only reports the plan. With an empty target folder it writes the
 * capsule files there and has the local Lean kernel check the proof again. The claim is imported as
 * HISTORICAL_KERNEL_VERIFIED; only a workspace VerificationGate run makes it current again.
 */
export async function replayClaimCapsule(path: string, target: string | undefined, lean: { adapter: LeanAdapter; workspaceRoot: string; tmpDir: string } | null) {
  const checked = verifyClaimCapsule(path)
  if (!checked.ok || !checked.record || !checked.manifest) throw new Error(`CAPSULE_INVALID: ${checked.errors.join(", ")}`)
  const record = checked.record, manifest = checked.manifest
  const targetEmpty = target !== undefined && (!existsSync(target) || readdirSync(target).length === 0)
  const plan = planCapsuleReplay({
    manifest: { schemaEpoch: manifest.schemaEpoch, toolchains: manifest.toolchains, models: manifest.models, claims: manifest.claims },
    // Replaying a verification re-checks the stored proof; it calls no model.
    environment: { schemaEpoch: WORKSPACE_SCHEMA_VERSION, toolchains: lean ? { lean: lean.workspaceRoot } : {}, models: true },
    targetEmpty,
  })
  if (target === undefined) return { schemaVersion: CAPSULE_REPLAY_SCHEMA, capsuleId: record.capsuleId, claimId: record.claim.id, dryRun: true, plan, status: plan.status === "BLOCKED" ? "BLOCKED" : "PLANNED" }

  const destination = resolve(target)
  applyCapsuleReplay(plan, {
    targetEmpty,
    userAction: true,
    write: () => {
      for (const [name, bytes] of checked.files) {
        const file = join(destination, name)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, bytes)
      }
    },
  })
  const source = checked.files.get(record.proof.path)!.toString("utf8")
  const context = { workspaceRoot: lean!.workspaceRoot, tmpDir: lean!.tmpDir }
  const kernel = await lean!.adapter.checkProof(source, context)
  const axioms = kernel.result === "KERNEL_ACCEPTED" ? await lean!.adapter.printAxioms(record.formal.declarationName, source, context) : []
  const expected = [...record.verification.axioms].sort(), actual = [...axioms].sort()
  const checks = {
    kernelAccepted: kernel.result === "KERNEL_ACCEPTED",
    axiomsMatch: JSON.stringify(expected) === JSON.stringify(actual),
    noForbiddenConstructs: scanForbidden(source).length === 0,
    sameLeanVersion: kernel.leanVersion === record.verification.leanVersion,
  }
  // A different Lean build is reported, not failed: the kernel check above is what decides.
  const replayed = checks.kernelAccepted && checks.axiomsMatch && checks.noForbiddenConstructs
  const report = {
    schemaVersion: CAPSULE_REPLAY_SCHEMA,
    capsuleId: record.capsuleId,
    claimId: record.claim.id,
    dryRun: false,
    target: destination,
    status: replayed ? "REPLAYED" : "FAILED",
    claimStatus: replayed ? plan.importedClaimStatuses[record.claim.id] ?? "HISTORICAL_KERNEL_VERIFIED" : "UNVERIFIED",
    checks,
    leanVersion: kernel.leanVersion,
    recordedLeanVersion: record.verification.leanVersion,
    axioms: actual,
    recordedAxioms: expected,
    diagnostics: kernel.diagnostics.map((item) => item.message).slice(0, 12),
  }
  writeFileSync(join(destination, "replay-report.json"), `${JSON.stringify(report, null, 2)}\n`)
  return report
}

/** Renders a verified claim as Markdown, LaTeX and HTML that cite its capsule. No model reasoning is included. */
export function buildClaimPublication(input: { root: string; claim: Claim; formal: FormalStatement; run: VerificationRun; capsuleSha256: string; outputDir?: string }) {
  const { claim, formal, run } = input
  const axioms = JSON.parse(run.axiomsJson) as string[]
  const text = [
    claim.naturalStatement,
    `Lean statement (${formal.declarationName}):`,
    formal.sourceText.trim(),
    `Checked by the Lean kernel (${run.leanVersion ?? "unknown version"}), verification ${run.id}. Axioms: ${axioms.join(", ") || "none"}.`,
  ].join("\n\n")
  const rendered = new PublicationService().render({
    title: claim.title,
    blocks: [{ id: claim.id, kind: "THEOREM", text, accepted: true, claimId: claim.id }],
    claims: [{ id: claim.id, status: claim.status }],
    citations: [],
    references: [],
    capsuleHash: input.capsuleSha256,
  })
  const outputDir = resolve(input.outputDir ?? join(input.root, "publication", claim.id))
  mkdirSync(outputDir, { recursive: true })
  const files = { markdown: "article.md", latex: "article.tex", html: "article.html" } as const
  for (const [format, name] of Object.entries(files)) writeFileSync(join(outputDir, name), rendered.outputs[format as keyof typeof files])
  const summary = { schemaVersion: "mathos.publication.v1", claimId: claim.id, claimStatus: claim.status, capsuleSha256: input.capsuleSha256, hash: rendered.hash, lossReport: rendered.lossReport, audit: rendered.audit, outputDir, files: Object.values(files) }
  writeFileSync(join(outputDir, "publication.json"), `${JSON.stringify(summary, null, 2)}\n`)
  return summary
}

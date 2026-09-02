import { createHash } from "node:crypto"
import { createReadStream, lstatSync } from "node:fs"
import { resolve } from "node:path"
import { validateCapsuleArtifactPath, type CapsuleManifestV1 } from "@mathos/domain"
export { exportCapsuleArchive, verifyCapsuleArchive } from "../capsule-archive.ts"
export { planCapsuleReplay, applyCapsuleReplay } from "../capsule-replay.ts"

type BuildInput = Omit<CapsuleManifestV1, "schemaVersion" | "createdAt" | "artifacts" | "models" | "redaction"> & { models: Array<Record<string, unknown> & { role: string; provider: string; model: string }>; artifactPaths: string[] }
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}` : JSON.stringify(value)
const digest = (value: string) => createHash("sha256").update(value).digest("hex")
const SECRET = /(OPENAI_API_KEY|ANTHROPIC_API_KEY|AWS_SECRET_ACCESS_KEY)\s*=|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{20,}\b|\b[A-Za-z0-9+/]{48,}={0,2}\b/

export class CapsuleService {
  constructor(private readonly options: { root: string; now?: () => string }) {}
  async inventory(paths: string[], allowlist: Array<{ path: string; reason: string }> = []) {
    const allowed = new Map(allowlist.map((row) => { if (!row.reason.trim()) throw new Error("CAPSULE_ALLOWLIST_REASON_REQUIRED"); return [validateCapsuleArtifactPath(row.path), row.reason] }))
    const rows = [] as CapsuleManifestV1["artifacts"]
    for (const raw of [...new Set(paths)].sort()) {
      const path = validateCapsuleArtifactPath(raw), absolute = resolve(this.options.root, path), stat = lstatSync(absolute)
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("CAPSULE_ARTIFACT_NOT_REGULAR_FILE")
      const hash = createHash("sha256"), chunks: Buffer[] = []
      for await (const chunk of createReadStream(absolute)) { const bytes = Buffer.from(chunk); hash.update(bytes); if (!allowed.has(path)) chunks.push(bytes) }
      if (!allowed.has(path) && SECRET.test(Buffer.concat(chunks).toString("utf8"))) throw new Error(`CAPSULE_SECRET_DETECTED: ${path}`)
      rows.push({ path, sha256: hash.digest("hex"), size: stat.size, mediaType: path.endsWith(".lean") ? "text/x-lean" : "application/octet-stream" })
    }
    return rows
  }
  async buildManifest(input: BuildInput) {
    const artifacts = await this.inventory(input.artifactPaths)
    const models = input.models.map(({ role, provider, model, ...configuration }) => ({ role, provider, model, configHash: digest(canonical(Object.fromEntries(Object.entries(configuration).filter(([key]) => !/key|token|secret|password/i.test(key))))) }))
    const manifest: CapsuleManifestV1 = { schemaVersion: "mathos-capsule-v1", capsuleId: input.capsuleId, workspace: input.workspace, createdAt: this.options.now?.() ?? new Date().toISOString(), git: input.git, schemaEpoch: input.schemaEpoch, toolchains: input.toolchains, models, prompts: input.prompts, retrieval: input.retrieval, artifacts, eventRange: input.eventRange, redaction: { passed: true, scannerVersion: "capsule-redaction-v1" }, claims: input.claims }
    return { manifest, canonicalJson: canonical(manifest), hash: digest(canonical(manifest)) }
  }
}

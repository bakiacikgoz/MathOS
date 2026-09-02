import { describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CapsuleService } from "../packages/core/src/services/capsule-service.ts"

const root = () => mkdtempSync(join(tmpdir(), "mathos-capsule-"))

describe("capsule manifest", () => {
  test("builds a deterministic canonical inventory without model keys", async () => {
    const dir = root(); writeFileSync(join(dir, "proof.lean"), "theorem t : True := by trivial\n")
    const service = new CapsuleService({ root: dir, now: () => "2030-01-01T00:00:00.000Z" })
    const input = { capsuleId: "CAP-1", workspace: { id: "W", name: "demo" }, git: { revision: "abc", dirty: true }, schemaEpoch: 30, toolchains: [{ name: "lean", version: "4", fingerprint: "lean4" }], models: [{ role: "planner", provider: "openai", model: "m", apiKey: "secret", temperature: 0 }], prompts: [{ purpose: "proof", hash: "ph" }], retrieval: [{ indexRevision: "idx", configHash: "rh" }], eventRange: { first: "E1", last: "E9", hash: "eh" }, claims: [{ id: "C1", status: "KERNEL_VERIFIED", verificationReportId: "V1" }], artifactPaths: ["proof.lean"] }
    const a = await service.buildManifest(input); const b = await service.buildManifest(input)
    expect(a.hash).toBe(b.hash); expect(a.manifest.git.dirty).toBe(true); expect(a.manifest.artifacts[0]?.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(a.manifest)).not.toContain("secret"); expect(a.manifest.models[0]?.configHash).toMatch(/^[a-f0-9]{64}$/)
  })
  test("blocks known secrets, entropy tokens, private keys, unsafe paths, and requires scoped allowlist reasons", async () => {
    const dir = root(); writeFileSync(join(dir, "bad.txt"), "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456\n-----BEGIN PRIVATE KEY-----")
    const service = new CapsuleService({ root: dir, now: () => "2030" })
    await expect(service.inventory(["bad.txt"])).rejects.toThrow("CAPSULE_SECRET_DETECTED")
    await expect(service.inventory(["../bad.txt"])).rejects.toThrow("CAPSULE_PATH_UNSAFE")
    expect((await service.inventory(["bad.txt"], [{ path: "bad.txt", reason: "documented test fixture" }]))[0]?.path).toBe("bad.txt")
    await expect(service.inventory(["bad.txt"], [{ path: "bad.txt", reason: "" }])).rejects.toThrow("CAPSULE_ALLOWLIST_REASON_REQUIRED")
  })
})

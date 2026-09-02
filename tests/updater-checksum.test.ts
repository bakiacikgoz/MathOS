import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { verifyUpdateArtifact } from "../packages/update/src/index.ts"
test("update artifact requires exact SHA-256",()=>{const bytes=Buffer.from("binary"),hash=createHash("sha256").update(bytes).digest("hex");expect(verifyUpdateArtifact(bytes,hash)).toBe(true);expect(()=>verifyUpdateArtifact(bytes,"0".repeat(64))).toThrow("UPDATE_CHECKSUM_MISMATCH")})

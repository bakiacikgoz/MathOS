import { expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CapsuleService } from "../packages/core/src/services/capsule-service.ts"
test("capsule scanner excludes credential canaries and raw debug dumps",async()=>{const root=mkdtempSync(join(tmpdir(),"capsule-secret-"));const canary=["authorization: Bearer ","sk","-","abcdefghijklmnopqrstuvwxyz123456"].join("");writeFileSync(join(root,"debug.log"),canary);await expect(new CapsuleService({root}).inventory(["debug.log"])).rejects.toThrow("CAPSULE_SECRET_DETECTED")})

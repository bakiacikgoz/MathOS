import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { exportCapsuleArchive, inspectCapsuleArchive } from "../packages/core/src/capsule-archive.ts"
test("capsule archive freezes product-independent format v1 and rejects newer versions",()=>{const root=mkdtempSync(join(tmpdir(),"capsule-v1-"));writeFileSync(join(root,"a"),"a");const out=join(root,"x.mathos");const a=exportCapsuleArchive({root,output:out,paths:["a"],productVersion:"1.0.0-rc.1",workspaceSchemaVersion:24,createdFromRevision:"abc"});expect(a.manifest).toMatchObject({format:"mathos-capsule",formatVersion:1,createdFromRevision:"abc"});const payload=JSON.parse(readFileSync(out,"utf8"));payload.manifest.formatVersion=2;writeFileSync(out,JSON.stringify(payload));expect(()=>inspectCapsuleArchive(out)).toThrow("CapsuleFormatUnsupported")})

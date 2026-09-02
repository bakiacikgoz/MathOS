import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { applyAtomicUpdate } from "../packages/update/src/index.ts"
test("failed post-install smoke atomically restores previous executable",()=>{const root=mkdtempSync(join(tmpdir(),"mathos-update-")),current=join(root,"mathos"),candidate=join(root,"candidate");writeFileSync(current,"old");writeFileSync(candidate,"new");expect(()=>applyAtomicUpdate({current,candidate,preSmoke:()=>true,postSmoke:()=>false})).toThrow("UPDATE_POST_SMOKE_FAILED_ROLLED_BACK");expect(readFileSync(current,"utf8")).toBe("old")})

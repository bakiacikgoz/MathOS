import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createSupportBundle, verifySupportBundle } from "@mathos/shared"
test("support bundle is metadata-only, self-checking, and has no telemetry endpoint",()=>{const root=mkdtempSync(join(tmpdir(),"mathos-support-")),path=createSupportBundle(root,{version:"1",platform:"test",doctor:{state:"READY"},rawPrompt:"secret prompt",proof:"theorem private"});expect(verifySupportBundle(path).ok).toBe(true);const text=readFileSync(path,"utf8");expect(text).not.toContain("secret prompt");expect(text).not.toContain("theorem private");expect(text).not.toMatch(/https?:\/\//)})

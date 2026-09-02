import { expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { repairWorkspaceRuntimeState } from "@mathos/workspace"
import { MathOS } from "@mathos/core"
import { runHeadless } from "../apps/tui/src/headless.ts"

test("workspace repair removes only known temporary runtime state", () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-repair-")); mkdirSync(join(root, ".mathos", "tmp"), { recursive: true }); mkdirSync(join(root, "research"), { recursive: true }); writeFileSync(join(root, ".mathos", "tmp", "orphan"), "x"); writeFileSync(join(root, "research", "proof.md"), "preserve")
  const report = repairWorkspaceRuntimeState(root)
  expect(report.removed).toEqual([".mathos/tmp"]); expect(existsSync(join(root, "research", "proof.md"))).toBe(true)
})

test("workspace inspect and repair expose machine-readable safe lifecycle", async () => {
  const parent = mkdtempSync(join(tmpdir(), "mathos-workspace-cli-")), created = await MathOS.init(parent, "w"), previous = process.cwd(); process.chdir(created.root)
  let output = ""; const write = process.stdout.write.bind(process.stdout); process.stdout.write = ((chunk: string | Uint8Array) => { output += String(chunk); return true }) as typeof process.stdout.write
  try { expect(await runHeadless(["workspace", "inspect", "--json"])).toBe(0); expect(JSON.parse(output).schemaEpoch).toBeGreaterThan(0); output = ""; expect(await runHeadless(["workspace", "repair", "--json"])).toBe(0); expect(JSON.parse(output).mathematicalStateChanged).toBe(false) } finally { process.stdout.write = write; process.chdir(previous) }
})

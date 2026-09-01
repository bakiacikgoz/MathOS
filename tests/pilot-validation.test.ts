import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { redactPilotText, runPilotValidation } from "../scripts/pilot-validation.ts"

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe("fresh-user pilot validation", () => {
  test("redacts credential-shaped values", () => {
    expect(redactPilotText("token=secret-canary Bearer abcdef", { MATHOS_API_KEY: "secret-canary" })).toBe("token=[REDACTED] [REDACTED]")
  })

  test("uses a fresh workspace and records honest capability blocks", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-evidence-")); dirs.push(dir)
    const output = join(dir, "result.json")
    const result = await runPilotValidation({ output })
    expect(result.steps.find((step) => step.id === "init")?.status).toBe("PASS")
    expect(result.steps.find((step) => step.id === "create_conjecture")?.status).toBe("PASS")
    expect(result.steps.find((step) => step.id === "reopen")?.status).toBe("PASS")
    expect(result.steps.find((step) => step.id === "restore")?.status).toBe("PASS")
    expect(result.steps.every((step) => step.reason.length > 0 && step.rerun.length > 0)).toBe(true)
    expect(JSON.parse(readFileSync(output, "utf8")).workspaceKind).toBe("fresh-temporary")
  }, 30_000)
})

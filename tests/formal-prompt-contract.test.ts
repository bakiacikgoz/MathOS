import { expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { NativeLeanAdapter } from "@mathos/lean"
import { FORMALIZE_SYSTEM_PROMPT } from "../packages/core/src/formal-prompts.ts"

const project = process.env.MATHOS_FORMAL_PROJECT ?? resolve(import.meta.dir, "../demo/formal")
const hasMathlib = existsSync(join(project, ".lake/packages/mathlib/Mathlib.lean"))

test.skipIf(!hasMathlib)("finite-sum syntax recommended to the model elaborates with pinned Mathlib", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mathos-formal-prompt-"))
  try {
    const example = FORMALIZE_SYSTEM_PROMPT.match(/`(∑[^`]+)`/)?.[1]
    expect(example).toBeDefined()
    const sum = example!.replace("...", "(2 * k + 1)")
    const checked = await new NativeLeanAdapter().checkStatement(`theorem prompt_sum (n : Nat) : (${sum}) = n ^ 2`, { workspaceRoot: project, tmpDir: dir })
    expect(checked.diagnostics.filter(d => d.severity === "error")).toEqual([])
    expect(checked.result).toBe("ELABORATES")
  } finally { rmSync(dir, { recursive: true, force: true }) }
}, 120_000)

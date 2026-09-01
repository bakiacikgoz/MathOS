import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NativeLeanAdapter, parseAxioms } from "@mathos/lean"

const adapter = new NativeLeanAdapter()

describe("real lean", () => {
  test("id_nat rfl is KERNEL_ACCEPTED", async () => {
    const env = await adapter.detect(process.cwd())
    if (!env.leanAvailable) {
      throw new Error("Lean should be installed for this task")
    }
    const dir = mkdtempSync(join(tmpdir(), "mathos-lean-real-"))
    try {
      const ok = await adapter.checkProof("theorem id_nat (n : Nat) : n = n := by\n  rfl\n", {
        workspaceRoot: dir,
        tmpDir: dir,
      })
      expect(ok.result).toBe("KERNEL_ACCEPTED")

      const bad = await adapter.checkProof("theorem id_nat (n : Nat) : n = n := by\n  exact (0 : Nat)\n", {
        workspaceRoot: dir,
        tmpDir: dir,
      })
      expect(bad.result).toBe("ERROR")

      const axioms = await adapter.printAxioms("id_nat", "theorem id_nat (n : Nat) : n = n := by\n  rfl\n", {
        workspaceRoot: dir,
        tmpDir: dir,
      })
      expect(Array.isArray(axioms)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("demo formal project is pinned with Mathlib", async () => {
    const env = await adapter.detect("/Users/yazilim/Projects/mathos/demo")
    expect(env.leanAvailable).toBe(true)
    expect(env.mathlib).toBe(true)
    expect(env.toolchain).toBe("leanprover/lean4:v4.33.1")
    expect(env.projectRoot).toContain("/demo/formal")
  })

  test("axiom printer parses lean output", () => {
    expect(parseAxioms("'id_nat' does not depend on any axioms")).toEqual([])
    expect(parseAxioms("'t' depends on axioms: [propext, Classical.choice]")).toEqual(["propext", "Classical.choice"])
  })
})

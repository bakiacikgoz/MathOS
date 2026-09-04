import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { NativeLeanAdapter, parseAxioms } from "@mathos/lean"

const adapter = new NativeLeanAdapter()
const nativeTest = Bun.which("lean") ? test : test.skip
const mathlibTest = Bun.which("lake") ? test : test.skip

describe("real lean", () => {
  nativeTest("id_nat rfl is KERNEL_ACCEPTED", async () => {
    const env = await adapter.detect(resolve(import.meta.dir, ".."))
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

  mathlibTest("demo formal project is pinned with Mathlib", async () => {
    const env = await adapter.detect(resolve(import.meta.dir, "../demo"))
    expect(env.leanAvailable).toBe(true)
    expect(env.mathlib).toBe(true)
    expect(env.toolchain).toBe("leanprover/lean4:v4.33.1")
    expect(env.projectRoot).toBe(resolve(import.meta.dir, "../demo/formal"))
  })

  test("axiom printer parses lean output", () => {
    expect(parseAxioms("'id_nat' does not depend on any axioms")).toEqual([])
    expect(parseAxioms("'t' depends on axioms: [propext, Classical.choice]")).toEqual(["propext", "Classical.choice"])
  })
})

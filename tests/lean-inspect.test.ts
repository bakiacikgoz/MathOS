import { resolve } from "node:path"
import { describe, expect, test } from "bun:test"
import { NativeLeanAdapter, parseCheckOutput } from "@mathos/lean"

const DEMO = resolve(resolve(import.meta.dir, ".."), "demo")

describe("real lean declaration inspect", () => {
  test("batch inspect Eq.refl Finset.card_union_le Nat.add_le_add", async () => {
    const adapter = new NativeLeanAdapter()
    const result = await adapter.inspectDeclarations(
      ["Eq.refl", "Finset.card_union_le", "Nat.add_le_add"],
      { workspaceRoot: DEMO },
      { timeoutMs: 180_000 },
    )
    expect(result.timedOut).toBe(false)
    const byName = new Map(result.inspections.map((item) => [item.name, item]))
    expect(byName.get("Eq.refl")?.exists).toBe(true)
    expect(byName.get("Eq.refl")?.elaborated).toBe(true)
    expect(byName.get("Eq.refl")?.propositionShape?.equality).toBe(true)
    expect(byName.get("Finset.card_union_le")?.exists).toBe(true)
    expect(byName.get("Finset.card_union_le")?.type ?? "").toMatch(/#|card|Finset/i)
    expect(byName.get("Nat.add_le_add")?.exists).toBe(true)
  }, 180_000)

  test("parseCheckOutput does not mark regex guesses as elaborated", () => {
    const parsed = parseCheckOutput(["ghost"], "warning: unused variable\n")
    expect(parsed[0]?.elaborated).toBe(false)
  })
})

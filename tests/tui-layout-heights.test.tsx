import { afterAll, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"
import type { ResearchStep } from "@mathos/domain"
import { AppShell } from "../apps/tui/src/ui/AppShell.tsx"
import { ResearchSummary } from "../apps/tui/src/ui/ResearchSummary.tsx"

const dir = mkdtempSync(join(tmpdir(), "mathos-tui-heights-"))
await MathOS.init(dir, "odd-sums")
const mathos = MathOS.open(join(dir, "odd-sums"))
mathos.createClaim({ kind: "conjecture", title: "Sum of odd numbers", statement: "The sum of the first n odd numbers is n squared." })
mathos.createClaim({ kind: "lemma", title: "Odd number formula", statement: "The k-th odd number is 2k+1." })
mathos.setMainObjective("C-001")
afterAll(() => { mathos.close(); rmSync(dir, { recursive: true, force: true }) })

async function frame(width: number, height: number) {
  const setup = await testRender(() => <AppShell mathos={mathos} />, { width, height })
  try { await setup.renderOnce(); await setup.renderOnce(); return setup.captureCharFrame().split("\n") }
  finally { setup.renderer.destroy() }
}

// Heights between the compact threshold and the full dashboard used to push the command grid and
// the sidebar over the composer and footer; every wide-mode height must keep those rows intact.
for (const [width, height] of [[120, 36], [120, 40], [160, 46], [160, 48], [160, 60]] as const) {
  test(`wide dashboard at ${width}x${height} never overlaps the composer or footer`, async () => {
    const rows = await frame(width, height)
    const prompt = rows.findIndex(row => row.includes("MathOS>"))
    expect(rows[prompt]).toMatch(/^│ MathOS> /)
    expect(rows[prompt - 1]).toMatch(/^┌─+┐$/)
    expect(rows[prompt + 1]).toMatch(/^└─+┘$/)
    expect(rows[prompt + 2]).toMatch(/^ Ctrl\+K palette {3}Ctrl\+R research {3}Ctrl\+G graph/)
    expect(rows[prompt + 2]).not.toMatch(/QUICK|Resume|\[\d\]/)
    expect(rows[prompt - 2]).toMatch(/^└─+┘└─+┘$/)
  })
}

test("the command grid appears only when it fits", async () => {
  expect((await frame(160, 46)).join("\n")).not.toContain("QUICK COMMANDS")
  expect((await frame(160, 48)).join("\n")).toContain("QUICK COMMANDS")
})

test("sidebar sections keep every research-state row", async () => {
  const text = (await frame(120, 40)).join("\n")
  for (const label of ["session", "state", "focus", "objective", "epistemic", "last activity"]) expect(text).toContain(` ${label} `)
})

test("status counts are not reported as progress or activity", async () => {
  const text = (await frame(160, 48)).join("\n")
  expect(text).toContain("No recorded progress yet")
  expect(text).toContain("No research activity yet")
  expect(text).not.toContain("--:--:--")
  expect(text).not.toMatch(/✓ .*0 verified/)
})

function step(sequence: number, summary: string): ResearchStep {
  const at = `2026-09-24T10:0${sequence}:00.000Z`
  return { id: `S-${sequence}`, runId: "RR-001", branchId: "B-000", sequence, action: "SEARCH" as ResearchStep["action"], inputArtifactIds: [], resultArtifactIds: [], status: "SUCCEEDED", idempotencyKey: `k${sequence}`, startedAt: at, finishedAt: at, summary, failureClass: null, createdAt: at }
}

test("recent activity shows only the steps that fit, one per row", async () => {
  const steps = Array.from({ length: 8 }, (_, index) => step(index + 1, `step summary ${index + 1}`))
  const setup = await testRender(() => <ResearchSummary status={mathos.status()} steps={steps} dashboardWidth={110} />, { width: 110, height: 30 })
  try {
    await setup.renderOnce(); await setup.renderOnce()
    const rows = setup.captureCharFrame().split("\n")
    const shown = rows.filter(row => /step summary \d/.test(row))
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.length).toBeLessThan(8)
    for (const row of shown) expect(row.match(/step summary \d/g)!.length).toBe(1)
    expect(shown[0]).toContain("step summary 8")
    const progress = rows.find(row => row.includes("✓"))!
    expect(progress).toContain("10:08:00")
    expect(progress).toContain("step summary 8")
  } finally { setup.renderer.destroy() }
})

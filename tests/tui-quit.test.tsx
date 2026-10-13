import { afterAll, expect, spyOn, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"
import { AppShell } from "../apps/tui/src/ui/AppShell.tsx"

const dir = mkdtempSync(join(tmpdir(), "mathos-tui-quit-"))
await MathOS.init(dir, "quit-workspace")
const mathos = MathOS.open(join(dir, "quit-workspace"))

afterAll(() => {
  mathos.close()
  rmSync(dir, { recursive: true, force: true })
})

test("/quit closes the session without touching the destroyed prompt", async () => {
  const setup = await testRender(() => <AppShell mathos={mathos} />, { width: 120, height: 32 })
  const errors = spyOn(console, "error")
  try {
    await setup.renderOnce()
    await setup.mockInput.typeText("/quit")
    setup.mockInput.pressEnter()
    await Bun.sleep(50)
    const logged = errors.mock.calls.map((call) => call.map(String).join(" ")).join("\n")
    expect(logged).not.toContain("is destroyed")
    expect(setup.renderer.isDestroyed).toBe(true)
  } finally {
    errors.mockRestore()
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
  }
})

test("quitting from the command palette also closes cleanly", async () => {
  const setup = await testRender(() => <AppShell mathos={mathos} />, { width: 120, height: 32 })
  const errors = spyOn(console, "error")
  try {
    await setup.renderOnce()
    setup.mockInput.pressKey("p", { ctrl: true })
    await setup.renderOnce()
    await setup.mockInput.typeText("quit")
    await setup.renderOnce()
    setup.mockInput.pressEnter()
    await Bun.sleep(50)
    const logged = errors.mock.calls.map((call) => call.map(String).join(" ")).join("\n")
    expect(logged).not.toContain("is destroyed")
    expect(setup.renderer.isDestroyed).toBe(true)
  } finally {
    errors.mockRestore()
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
  }
})

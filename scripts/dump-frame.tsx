import { testRender } from "@opentui/solid"
import { MathOS } from "@mathos/core"
import { AppShell } from "../apps/tui/src/ui/AppShell.tsx"

const mathos = MathOS.open(process.argv[2] ?? "demo")
const setup = await testRender(() => <AppShell mathos={mathos} />, { width: 100, height: 28 })
try {
  await setup.renderOnce()
  process.stdout.write(setup.captureCharFrame() + "\n")
} finally {
  setup.renderer.destroy()
  mathos.close()
}

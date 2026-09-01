import { createCliRenderer } from "@opentui/core"
import { render } from "@opentui/solid"
import { MathOS } from "@mathos/core"
import { theme } from "./theme.ts"
import { AppShell } from "./ui/AppShell.tsx"

export async function startTui(): Promise<number> {
  if (!MathOS.tryLocate(process.cwd())) {
    process.stderr.write("No MathOS workspace found. Run `mathos init` first.\n")
    return 1
  }

  const mathos = MathOS.open(process.cwd())
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    backgroundColor: theme.background,
  })

  const done = new Promise<void>((resolve) => {
    renderer.once("destroy", () => resolve())
  })

  try {
    await render(() => <AppShell mathos={mathos} />, renderer)
    await done
    return 0
  } catch (error) {
    renderer.destroy()
    throw error
  } finally {
    mathos.close()
  }
}

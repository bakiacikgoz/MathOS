import { createCliRenderer } from "@opentui/core"
import { render } from "@opentui/solid"
import { MathOS } from "@mathos/core"
import type { ModelRole } from "@mathos/models"
import { theme } from "./theme.ts"
import { AppShell } from "./ui/AppShell.tsx"
import { configuredModelProviders, configuredModelRoleAssignments, createReloadingModelProviders, hasConfiguredModelProfiles } from "./model-runtime.ts"

export async function startTui(): Promise<number> {
  if (!MathOS.tryLocate(process.cwd())) {
    process.stderr.write("No MathOS workspace found. Run `mathos init` first.\n")
    return 1
  }

  const workspaceRoot = process.cwd()
  const configuredRoles = configuredModelRoleAssignments(workspaceRoot)
  const modelRoles: ModelRole[] = ["planner", "researcher", "formalizer", "prover", configuredRoles.alignment ? "alignment" : "auditor", "checker"]
  const modelRuntime = hasConfiguredModelProfiles(workspaceRoot)
    ? createReloadingModelProviders(modelRoles, roles => configuredModelProviders(workspaceRoot, roles))
    : undefined
  let mathos: MathOS
  try {
    const modelProvider = modelRuntime?.providers.researcher
    mathos = MathOS.open(workspaceRoot, { modelProvider, modelProviders: modelRuntime?.providers })
  } catch (error) {
    await modelRuntime?.close()
    throw error
  }
  const terminalThemeActive = Boolean(process.stdout.isTTY)
  if (terminalThemeActive) process.stdout.write(`\u001b]11;${theme.background}\u0007`)
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
    await modelRuntime?.close()
    if (terminalThemeActive) process.stdout.write("\u001b]111\u0007")
  }
}

import { LEAN_INSTALL_STEPS, type LeanInstallStep } from "./install.ts"

// How much of the install each step is, roughly by the time it takes on a typical connection: the Mathlib cache
// is most of it, the Lean toolchain and Mathlib's sources are the rest.
const WEIGHT: Record<LeanInstallStep, number> = { git: 1, elan: 4, project: 1, toolchain: 14, mathlib: 20, cache: 50, build: 10 }
const TOTAL = Object.values(WEIGHT).reduce((sum, value) => sum + value, 0)

export interface LeanInstallProgress { step: LeanInstallStep | null; percent: number }

/** One overall percentage from the install's events: finished steps count in full, the running one by its own progress. */
export function leanInstallProgress(events: Array<Record<string, unknown>>): LeanInstallProgress {
  const finished = new Set<LeanInstallStep>()
  let step: LeanInstallStep | null = null, stepPercent = 0
  for (const event of events) {
    const name = event.step as LeanInstallStep
    if (!LEAN_INSTALL_STEPS.includes(name)) continue
    if (event.type === "step") {
      if (event.state === "running") { step = name; stepPercent = 0 }
      else if (event.state === "done" || event.state === "skipped") { finished.add(name); if (step === name) step = null }
    } else if (event.type === "progress" && name === step) stepPercent = Math.max(stepPercent, Number(event.percent) || 0)
  }
  const done = [...finished].reduce((sum, name) => sum + WEIGHT[name], 0)
  const current = step ? WEIGHT[step] * Math.min(stepPercent, 99) / 100 : 0
  return { step, percent: Math.min(99, Math.floor(((done + current) / TOTAL) * 100)) }
}

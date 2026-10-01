import { homedir, tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"
import { NativeLeanAdapter, PINNED_LEAN_TOOLCHAIN, leanRuntimeRoot } from "@mathos/lean"

const DEMO = resolve(import.meta.dir, "../../demo")

/** The test preload isolates Lean; opt in to the machine's pinned runtime for a real native test. */
export async function withNativeMathlib<T>(work: (projectRoot: string) => Promise<T>): Promise<T> {
  const previous = process.env.MATHOS_LEAN_RUNTIME
  const isolated = join(tmpdir(), "mathos-test-no-lean-runtime")
  const runtimeRoot = previous && resolve(previous) !== resolve(isolated)
    ? previous
    : leanRuntimeRoot({ ...process.env, MATHOS_LEAN_RUNTIME: undefined })
  process.env.MATHOS_LEAN_RUNTIME = runtimeRoot
  try {
    const env = await new NativeLeanAdapter().detect(DEMO)
    if (!env.leanAvailable || !env.lakeAvailable || !env.mathlib || !env.projectRoot || env.toolchain !== PINNED_LEAN_TOOLCHAIN) {
      throw new Error(`Pinned Mathlib is unavailable (runtime=${runtimeRoot}, lean=${env.leanAvailable}, lake=${env.lakeAvailable}, mathlib=${env.mathlib}, toolchain=${env.toolchain}); run \`bun run mathos lean install --accept-downloads=lean,mathlib\` before native Lean tests`)
    }
    return await work(env.projectRoot)
  } finally {
    if (previous === undefined) delete process.env.MATHOS_LEAN_RUNTIME
    else process.env.MATHOS_LEAN_RUNTIME = previous
  }
}

export function nativeLeanPath(): string {
  return `${join(homedir(), ".elan", "bin")}${delimiter}${process.env.PATH ?? ""}`
}

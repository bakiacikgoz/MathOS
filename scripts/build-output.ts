import { rmSync } from "node:fs"
import { resolve } from "node:path"

export function prepareDevelopmentBuildOutput(outdir: string): void {
  rmSync(resolve(outdir, "cli.js"), { force: true })
  rmSync(resolve(outdir, "cli.js.map"), { force: true })
}

// Bun before 1.4.1 bundles the Solid TUI into a CLI that crashes at startup ("Orphan text error").
export const MINIMUM_BUN_VERSION = "1.4.1";
export function assertSupportedBun(version = Bun.version): void {
  if (!Bun.semver.satisfies(version, `>=${MINIMUM_BUN_VERSION}`)) throw new Error(`BUN_VERSION_UNSUPPORTED: Bun ${version} found; building MathOS needs Bun ${MINIMUM_BUN_VERSION} or newer.`);
}

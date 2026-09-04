import { rmSync } from "node:fs"
import { resolve } from "node:path"

export function prepareDevelopmentBuildOutput(outdir: string): void {
  rmSync(resolve(outdir, "cli.js"), { force: true })
  rmSync(resolve(outdir, "cli.js.map"), { force: true })
}

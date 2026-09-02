import { rmSync } from "node:fs"
import { resolve } from "node:path"
import { assertProductVersionAlignment, readProductSurfaceVersions } from "@mathos/shared"

const root = resolve(import.meta.dir, "..")
assertProductVersionAlignment(readProductSurfaceVersions(root))
const outdir = resolve(root, "apps/vscode-extension/dist")
rmSync(outdir, { recursive: true, force: true })
const result = await Bun.build({ entrypoints: [resolve(root, "apps/vscode-extension/src/extension.ts")], outdir, target: "node", format: "esm", minify: false })
if (!result.success) { for (const log of result.logs) console.error(log); process.exit(1) }
console.log(`Built VS Code extension: ${result.outputs.length} artifact(s)`)

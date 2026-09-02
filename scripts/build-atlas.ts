import { rmSync } from "node:fs"
import { resolve } from "node:path"
import { assertProductVersionAlignment, readProductSurfaceVersions } from "@mathos/shared"

const root = resolve(import.meta.dir, "..")
assertProductVersionAlignment(readProductSurfaceVersions(root))
const outdir = resolve(root, "apps/atlas/dist")
rmSync(outdir, { recursive: true, force: true })
const result = await Bun.build({ entrypoints: [resolve(root, "apps/atlas/src/main.tsx")], outdir, target: "browser", minify: false })
if (!result.success) { for (const log of result.logs) console.error(log); process.exit(1) }
console.log(`Built Atlas: ${result.outputs.length} artifact(s)`)

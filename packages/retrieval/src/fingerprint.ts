import { createHash } from "node:crypto"
import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16)
}

export function fingerprintFiles(root: string, relativeDirs: string[]): string {
  const parts: string[] = []
  for (const dir of relativeDirs) {
    walk(join(root, dir), (file, stat) => {
      if (!file.endsWith(".lean")) return
      parts.push(`${file}:${stat.size}:${Math.floor(stat.mtimeMs)}`)
    })
  }
  return hashText(parts.sort().join("|"))
}

export function walk(dir: string, visit: (file: string, stat: ReturnType<typeof statSync>) => void): void {
  if (!existsSync(dir)) return
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === ".lake") continue
      walk(full, visit)
      continue
    }
    if (entry.isFile()) visit(full, statSync(full))
  }
}

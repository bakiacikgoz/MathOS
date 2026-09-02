import { existsSync, rmSync } from "node:fs"
import { join, relative } from "node:path"
export function repairWorkspaceRuntimeState(root: string): { removed: string[]; mathematicalStateChanged: false } { const candidates = [join(root, ".mathos", "tmp")], removed: string[] = []; for (const path of candidates) if (existsSync(path)) { rmSync(path, { recursive: true, force: true }); removed.push(relative(root, path).replaceAll("\\", "/")) } return { removed, mathematicalStateChanged: false } }

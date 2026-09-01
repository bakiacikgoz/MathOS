import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { IndexManifest, IndexStatus, LeanDeclaration } from "./types.ts"
import { INDEX_FORMAT_VERSION, type ChannelIndex } from "./channels.ts"

export function indexDir(workspaceRoot: string): string {
  return join(workspaceRoot, ".mathos", "index")
}

export function readIndex(workspaceRoot: string): { manifest: IndexManifest; declarations: LeanDeclaration[]; channels: ChannelIndex | null } | null {
  const dir = indexDir(workspaceRoot)
  const manifestPath = join(dir, "manifest.json")
  const declsPath = join(dir, "declarations.json")
  if (!existsSync(manifestPath) || !existsSync(declsPath)) return null
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as IndexManifest
    const declarations = JSON.parse(readFileSync(declsPath, "utf8")) as LeanDeclaration[]
    const channelsPath = join(dir, "channels.json")
    const channels = existsSync(channelsPath) ? (JSON.parse(readFileSync(channelsPath, "utf8")) as ChannelIndex) : null
    return { manifest, declarations, channels }
  } catch {
    return null
  }
}

export function writeIndex(workspaceRoot: string, manifest: IndexManifest, declarations: LeanDeclaration[], channels?: ChannelIndex): void {
  const dir = indexDir(workspaceRoot)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  writeFileSync(join(dir, "declarations.json"), `${JSON.stringify(declarations)}\n`, "utf8")
  if (channels) writeFileSync(join(dir, "channels.json"), `${JSON.stringify(channels)}\n`, "utf8")
}

export function indexStatus(
  workspaceRoot: string,
  expected: { leanVersion: string | null; mathlibRevision: string | null; formalFingerprint: string; verifiedFingerprint: string },
): IndexStatus {
  const stored = readIndex(workspaceRoot)
  if (!stored) return { present: false, stale: true, manifest: null, reason: "Premise index missing. Run mathos index build." }
  const { manifest, channels } = stored
  if (manifest.formatVersion !== INDEX_FORMAT_VERSION || !channels) {
    return { present: true, stale: true, manifest, reason: "INDEX STALE Rebuild required", channelIndex: manifest.channelCounts }
  }
  if (expected.leanVersion && manifest.leanVersion !== expected.leanVersion) {
    return { present: true, stale: true, manifest, reason: "Lean version changed", channelIndex: channels.counts }
  }
  if (manifest.mathlibRevision !== expected.mathlibRevision) {
    return { present: true, stale: true, manifest, reason: "Mathlib revision changed", channelIndex: channels.counts }
  }
  if (manifest.formalFingerprint !== expected.formalFingerprint) {
    return { present: true, stale: true, manifest, reason: "Formal sources changed", channelIndex: channels.counts }
  }
  if (manifest.verifiedFingerprint !== expected.verifiedFingerprint) {
    return { present: true, stale: true, manifest, reason: "Verified local claim set changed", channelIndex: channels.counts }
  }
  return { present: true, stale: false, manifest, channelIndex: channels.counts }
}

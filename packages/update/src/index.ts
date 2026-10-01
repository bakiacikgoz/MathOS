import { createHash, randomUUID } from "node:crypto"
import { constants, copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"

export interface UpdateManifest { version: string; channel: "stable" | "rc"; minimumSchema: number; maximumSchema: number; sha256: string }

interface Version { core: bigint[]; prerelease: string[] }
const versionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

function parseVersion(value: unknown): Version | null {
  if (typeof value !== "string") return null
  const match = versionPattern.exec(value)
  if (!match) return null
  return { core: [BigInt(match[1]!), BigInt(match[2]!), BigInt(match[3]!)], prerelease: match[4]?.split(".") ?? [] }
}

function compareVersions(left: Version, right: Version): number {
  for (let index = 0; index < 3; index++) {
    if (left.core[index]! < right.core[index]!) return -1
    if (left.core[index]! > right.core[index]!) return 1
  }
  if (left.prerelease.length === 0) return right.prerelease.length === 0 ? 0 : 1
  if (right.prerelease.length === 0) return -1
  for (let index = 0; index < Math.min(left.prerelease.length, right.prerelease.length); index++) {
    const a = left.prerelease[index]!
    const b = right.prerelease[index]!
    const aNumeric = /^[0-9]+$/.test(a)
    const bNumeric = /^[0-9]+$/.test(b)
    if (aNumeric && bNumeric) {
      const aNumber = BigInt(a)
      const bNumber = BigInt(b)
      if (aNumber < bNumber) return -1
      if (aNumber > bNumber) return 1
    } else if (aNumeric !== bNumeric) {
      return aNumeric ? -1 : 1
    } else {
      if (a < b) return -1
      if (a > b) return 1
    }
  }
  return Math.sign(left.prerelease.length - right.prerelease.length)
}

export function checkUpdate(input: { currentVersion: string; channel: "stable" | "rc"; manifest: UpdateManifest; schemaVersion: number }) {
  const { manifest } = input
  const currentVersion = parseVersion(input.currentVersion)
  const latestVersion = parseVersion(manifest?.version)
  const schemaRangeValid = Number.isSafeInteger(manifest?.minimumSchema) && manifest.minimumSchema >= 0
    && Number.isSafeInteger(manifest?.maximumSchema) && manifest.maximumSchema >= manifest.minimumSchema
    && Number.isSafeInteger(input.schemaVersion) && input.schemaVersion >= 0
  const compatible = schemaRangeValid && input.schemaVersion >= manifest.minimumSchema && input.schemaVersion <= manifest.maximumSchema
  const channelValid = (manifest?.channel === "stable" && latestVersion?.prerelease.length === 0)
    || (manifest?.channel === "rc" && (latestVersion?.prerelease.length ?? 0) > 0)
  const channelAllowed = input.channel === "rc" ? channelValid : input.channel === "stable" && manifest?.channel === "stable" && channelValid
  const checksumValid = typeof manifest?.sha256 === "string" && /^[a-f0-9]{64}$/.test(manifest.sha256)
  const available = compatible && channelAllowed && checksumValid && currentVersion !== null && latestVersion !== null && compareVersions(latestVersion, currentVersion) > 0
  return { schemaVersion: "mathos.update-check.v1", currentVersion: input.currentVersion, latestVersion: manifest?.version, available, compatible, channel: input.channel }
}

export function verifyUpdateArtifact(bytes: Uint8Array, expected: string) {
  const actual = createHash("sha256").update(bytes).digest("hex")
  if (!/^[a-f0-9]{64}$/.test(expected) || actual !== expected) throw new Error("UPDATE_CHECKSUM_MISMATCH")
  return true
}

export function applyAtomicUpdate(input: { current: string; candidate: string; preSmoke: (path: string) => boolean; postSmoke: (path: string) => boolean }) {
  const current = resolve(input.current)
  const candidate = resolve(input.candidate)
  if (current === candidate) throw new Error("UPDATE_ARTIFACT_SAME_AS_CURRENT")
  if (!existsSync(current) || !existsSync(candidate)) throw new Error("UPDATE_ARTIFACT_MISSING")
  try {
    if (!input.preSmoke(candidate)) throw new Error("pre smoke returned false")
  } catch (error) {
    throw new Error("UPDATE_PRE_SMOKE_FAILED", { cause: error })
  }

  const backup = `${current}.previous`
  const id = randomUUID()
  const staging = `${current}.staged-${id}`
  const oldCurrent = `${current}.update-old-${id}`
  const priorBackup = `${backup}.update-old-${id}`
  let oldCopied = false
  let installed = false
  let backupMoved = false
  let oldAtBackup = false
  let postSmokeStarted = false
  try {
    mkdirSync(dirname(current), { recursive: true })
    copyFileSync(candidate, staging, constants.COPYFILE_EXCL)
    copyFileSync(current, oldCurrent, constants.COPYFILE_EXCL)
    oldCopied = true
    // Replace the canonical path in one filesystem operation. An interruption
    // before this rename still leaves the working executable at current.
    renameSync(staging, current)
    installed = true
    postSmokeStarted = true
    if (!input.postSmoke(current)) throw new Error("post smoke returned false")
    if (existsSync(backup)) {
      renameSync(backup, priorBackup)
      backupMoved = true
    }
    renameSync(oldCurrent, backup)
    oldAtBackup = true
    oldCopied = false
    // At this point current and rollback are usable. A locked stale backup is
    // harmless; failure to remove it must not undo a committed update.
    if (backupMoved) {
      try { rmSync(priorBackup, { force: true }) } catch { /* optional stale backup cleanup */ }
    }
    return { applied: true, current, rollback: backup }
  } catch (error) {
    try {
      if (installed) {
        // Replacing the candidate directly avoids a second canonical-path gap.
        renameSync(oldAtBackup ? backup : oldCurrent, current)
        oldCopied = false
      } else if (oldCopied) {
        rmSync(oldCurrent, { force: true })
        oldCopied = false
      }
      if (backupMoved) renameSync(priorBackup, backup)
    } catch (restoreError) {
      throw new Error("UPDATE_ROLLBACK_FAILED", { cause: { applyError: error, restoreError, current, oldCurrent, backup, priorBackup } })
    }
    throw new Error(postSmokeStarted ? "UPDATE_POST_SMOKE_FAILED_ROLLED_BACK" : "UPDATE_APPLY_FAILED_ROLLED_BACK", { cause: error })
  } finally {
    // Cleanup must not hide a more useful failure or its recovery paths.
    try { rmSync(staging, { force: true }) } catch { /* a locked staging file retains its unique path */ }
  }
}

export function rollbackUpdate(currentPath: string) {
  const current = resolve(currentPath)
  const backup = `${current}.previous`
  if (!existsSync(backup)) throw new Error("UPDATE_ROLLBACK_UNAVAILABLE")
  if (!statSync(backup).isFile() || !existsSync(current) || !statSync(current).isFile()) throw new Error("UPDATE_ROLLBACK_INVALID")
  const failed = `${current}.failed-${randomUUID()}`
  copyFileSync(current, failed, constants.COPYFILE_EXCL)
  try {
    renameSync(backup, current)
  } catch (error) {
    // A failed replacement leaves current and backup in place.
    try { rmSync(failed, { force: true }) } catch { /* retain a unique recovery copy if locked */ }
    throw error
  }
  try { rmSync(failed, { force: true }) } catch { /* prior executable remains at a unique recovery path */ }
  return { rolledBack: true, current }
}

export function uninstallMathOS(input: { binary: string; productData: string; userData: string; workspaces: string[]; purge: boolean }) {
  rmSync(resolve(input.binary), { force: true })
  rmSync(resolve(input.productData), { recursive: true, force: true })
  if (input.purge) {
    const user = resolve(input.userData)
    if (input.workspaces.some(path => resolve(path) === user || resolve(path).startsWith(`${user}\\`) || resolve(path).startsWith(`${user}/`))) throw new Error("UNINSTALL_PURGE_CONTAINS_WORKSPACE")
    rmSync(user, { recursive: true, force: true })
  }
  return { removed: true, preservedWorkspaces: input.workspaces.map(path => resolve(path)), preservedUserData: !input.purge }
}

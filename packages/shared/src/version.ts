import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { BRIDGE_PROTOCOL_VERSION, CAPSULE_FORMAT_VERSION, PLUGIN_API_VERSION, PUBLICATION_FORMAT_VERSION, WORKSPACE_SCHEMA_VERSION, assertProductVersionAlignment as assertAlignment } from "./compatibility.ts"

export const MATHOS_RELEASE_NAME = "MathOS"
export const MATHOS_PRODUCT_VERSION = "0.1.0-alpha.1"

export interface MathOSBuildIdentity {
  productVersion:string;gitRevision:string;buildId:string;schemaVersion:number;bridgeProtocolVersion:number;pluginApiVersion:number;capsuleFormatVersion:number;publicationFormatVersion:number
}

function findRootPackage(): { dir: string; version: string } {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i++) {
    const pkg = join(dir, "package.json")
    if (existsSync(pkg)) {
      try {
        const json = JSON.parse(readFileSync(pkg, "utf8")) as { name?: string; version?: string }
        if (json.name === "mathos" && json.version) return { dir, version: json.version }
      } catch { /* continue */ }
    }
    const parent = join(dir, "..")
    if (parent === dir) break
    dir = parent
  }
  return { dir: process.cwd(), version: MATHOS_PRODUCT_VERSION }
}

export function mathosVersion(): string {
  return MATHOS_PRODUCT_VERSION
}

export function gitCommitFull(cwd=mathosRepoRoot()):string|null {try{const proc=spawnSync("git",["rev-parse","HEAD"],{cwd,encoding:"utf8"});const sha=(proc.stdout||"").trim();return proc.status===0&&/^[0-9a-f]{40}$/u.test(sha)?sha:null}catch{return null}}

export function currentBuildIdentity(overrides:{gitRevision?:string;buildId?:string}={}):MathOSBuildIdentity{
  const gitRevision=overrides.gitRevision??process.env.MATHOS_BUILD_REVISION??gitCommitFull()??"UNKNOWN"
  return{productVersion:MATHOS_PRODUCT_VERSION,gitRevision,buildId:overrides.buildId??process.env.MATHOS_BUILD_ID??`${MATHOS_PRODUCT_VERSION}+${gitRevision.slice(0,12)}`,schemaVersion:WORKSPACE_SCHEMA_VERSION,bridgeProtocolVersion:BRIDGE_PROTOCOL_VERSION,pluginApiVersion:PLUGIN_API_VERSION,capsuleFormatVersion:CAPSULE_FORMAT_VERSION,publicationFormatVersion:PUBLICATION_FORMAT_VERSION}
}

export function assertProductVersionAlignment(packages:Array<{name:string;version:string}>):void{assertAlignment(packages,MATHOS_PRODUCT_VERSION)}

export function mathosRepoRoot(): string {
  return findRootPackage().dir
}

export function gitCommitShort(cwd = mathosRepoRoot()): string | null {
  try {
    const proc = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd, encoding: "utf8" })
    if (proc.status !== 0) return null
    const sha = (proc.stdout || "").trim()
    return sha || null
  } catch {
    return null
  }
}

export function formatMathosVersion(schemaEpoch?: number): string {
  const commit = gitCommitShort()
  const schema = schemaEpoch != null ? `schema ${schemaEpoch}` : null
  return [MATHOS_RELEASE_NAME, mathosVersion(), commit ? `commit ${commit}` : null, schema].filter(Boolean).join(" ")
}

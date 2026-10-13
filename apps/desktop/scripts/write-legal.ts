#!/usr/bin/env bun
// Writes LICENSE, NOTICE, SOURCE.json and the third-party inventory into src-tauri/legal/, which the
// installer bundles (tauri.bundle.conf.json). --require-complete fails when a license or notice is missing.
import { mkdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { currentBuildIdentity } from "../../../packages/shared/src/version.ts"
import { writeReleaseLegalFiles } from "../../../scripts/distribution/build-release.ts"

const target = process.argv.find((arg) => arg.startsWith("--target="))?.slice(9)
if (!target) throw new Error("DESKTOP_LEGAL: pass --target=<release target>, e.g. --target=windows-x64")
const outDir = resolve(import.meta.dir, "..", "src-tauri", "legal")
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
const { licenses } = await writeReleaseLegalFiles(resolve(import.meta.dir, "..", "..", ".."), outDir, currentBuildIdentity().gitRevision, `desktop-${target}`)
console.log(JSON.stringify({ outDir, unresolved: licenses.unresolvedCount, missingNotices: licenses.missingNoticeCount, notDistributed: licenses.notDistributedCount, releaseBlocked: licenses.releaseBlocked }))
if (licenses.releaseBlocked && process.argv.includes("--require-complete")) process.exit(1)

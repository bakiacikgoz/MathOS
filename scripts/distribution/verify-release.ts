#!/usr/bin/env bun
import { readFileSync } from "node:fs"
import { join,resolve } from "node:path"
import { assertMathOSCompatibility,verifyReleaseManifest,type ReleaseManifestV1 } from "@mathos/shared"
import { hostReleaseTarget } from "./build-release.ts"
const ROOT=resolve(import.meta.dir,"..","..")
export function verifyRelease(releaseRoot:string){const manifest=JSON.parse(readFileSync(join(releaseRoot,"RELEASE-MANIFEST.json"),"utf8"))as ReleaseManifestV1;assertMathOSCompatibility({workspaceSchemaVersion:30,bridgeProtocolVersion:manifest.bridgeProtocolVersion,pluginApiVersion:manifest.pluginApiVersion,capsuleFormatVersion:1,publicationFormatVersion:1});const integrity=verifyReleaseManifest(releaseRoot,manifest),expected=manifest.files.map(file=>`${file.sha256}  ${file.path}`).join("\n")+"\n",actual=readFileSync(join(releaseRoot,"SHA256SUMS"),"utf8");if(actual!==expected)integrity.errors.push("RELEASE_CHECKSUM_FILE_MISMATCH");return{ok:integrity.errors.length===0&&manifest.gitRevision!=="UNKNOWN",manifest,errors:integrity.errors}}
if(import.meta.main){const releaseRoot=process.argv[2]??join(ROOT,"artifacts","releases",(await import("@mathos/shared")).MATHOS_PRODUCT_VERSION,hostReleaseTarget(),"root"),report=verifyRelease(releaseRoot);console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1}

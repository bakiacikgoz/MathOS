#!/usr/bin/env bun
import { copyFileSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { dirname,join,resolve } from "node:path"
import { MATHOS_PRODUCT_VERSION,assertProductVersionAlignment,createReleaseManifest,currentBuildIdentity,readProductSurfaceVersions } from "@mathos/shared"
import { packageAtlas } from "./package-atlas.ts"
import { packageVscodeBridge } from "./package-vscode.ts"
import { createReleaseDependencyInventory } from "./dependency-inventory.ts"
import { enrichReleaseDependencyInventory } from "./license-registry.ts"
import solidPlugin from "@opentui/solid/bun-plugin"
import { assertSupportedBun } from "../build-output.ts"

const ROOT=resolve(import.meta.dir,"..","..")
const targetNames:Record<string,string>={"darwin-arm64":"bun-darwin-arm64","darwin-x64":"bun-darwin-x64","linux-x64":"bun-linux-x64","linux-arm64":"bun-linux-arm64","windows-x64":"bun-windows-x64"}
export function hostReleaseTarget():string{return process.platform==="darwin"?`darwin-${process.arch}`:process.platform==="linux"?`linux-${process.arch}`:`windows-${process.arch}`}
export function standaloneCompileOptions(target:string,outfile:string){const bunTarget=targetNames[target];if(!bunTarget)throw new Error(`RELEASE_TARGET_UNSUPPORTED:${target}`);return{target:bunTarget as any,outfile,autoloadBunfig:false}}
async function runBuildScript(script:string){const proc=Bun.spawn([process.execPath,"run",script],{cwd:ROOT,stdout:"inherit",stderr:"inherit",stdin:"ignore"});if(await proc.exited!==0)throw new Error(`RELEASE_BUILD_STEP_FAILED:${script}`)}
export function writeReleaseArchiveChecksums(outputRoot:string,version:string):string{
  const versionRoot=join(outputRoot,version)
  const archiveNames=readdirSync(versionRoot,{withFileTypes:true}).filter(row=>row.isFile()&&Object.keys(targetNames).some(target=>row.name===`mathos-${version}-${target}.tar.gz`)).map(row=>({archiveName:row.name,archivePath:join(versionRoot,row.name)})).sort((a,b)=>a.archiveName.localeCompare(b.archiveName))
  if(archiveNames.length===0)throw new Error("RELEASE_ARCHIVES_MISSING")
  const checksumPath=join(versionRoot,"SHA256SUMS")
  writeFileSync(checksumPath,archiveNames.map(({archiveName,archivePath})=>`${createHash("sha256").update(readFileSync(archivePath)).digest("hex")}  ${archiveName}`).join("\n")+"\n")
  return checksumPath
}
export function packageReleaseLegalMetadata(sourceRoot:string,releaseRoot:string,gitRevision:string):string[]{
  if(!/^[0-9a-f]{40}$/.test(gitRevision))throw new Error("RELEASE_SOURCE_REVISION_INVALID")
  for(const name of ["LICENSE","NOTICE"])copyFileSync(join(sourceRoot,name),join(releaseRoot,name))
  writeFileSync(join(releaseRoot,"SOURCE.json"),JSON.stringify({gitRevision,sourceUrl:`https://github.com/bakiacikgoz/MathOS/tree/${gitRevision}`},null,2)+"\n")
  return["LICENSE","NOTICE","SOURCE.json"]
}
export async function buildRelease(target=hostReleaseTarget(),outputRoot=join(ROOT,"artifacts","releases")){assertSupportedBun();
  const bunTarget=targetNames[target];if(!bunTarget)throw new Error(`RELEASE_TARGET_UNSUPPORTED:${target}`)
  assertProductVersionAlignment(readProductSurfaceVersions(ROOT));await runBuildScript("build:atlas");await runBuildScript("build:vscode")
  const identity=currentBuildIdentity(),releaseRoot=join(outputRoot,MATHOS_PRODUCT_VERSION,target,"root");rmSync(releaseRoot,{recursive:true,force:true});mkdirSync(join(releaseRoot,"bin"),{recursive:true})
  const executableName=target.startsWith("windows-")?"mathos.exe":"mathos",executable=join(releaseRoot,"bin",executableName)
  const result=await Bun.build({entrypoints:[join(ROOT,"apps","tui","src","cli.ts")],plugins:[solidPlugin],compile:standaloneCompileOptions(target,executable),minify:true,define:{"process.env.MATHOS_BUILD_REVISION":JSON.stringify(identity.gitRevision),"process.env.MATHOS_BUILD_ID":JSON.stringify(identity.buildId)}})
  if(!result.success)throw new Error(`STANDALONE_BUILD_FAILED:${result.logs.map(String).join(";")}`)
  const paths=[`bin/${executableName}`,...packageAtlas(ROOT,releaseRoot),...packageVscodeBridge(ROOT,releaseRoot)]
  paths.push(...packageReleaseLegalMetadata(ROOT,releaseRoot,identity.gitRevision))
  const inventory=createReleaseDependencyInventory({sourceRoot:ROOT,gitRevision:identity.gitRevision,productVersion:MATHOS_PRODUCT_VERSION,target});if(process.env.MATHOS_RELEASE_ENRICH_LICENSES==="1")await enrichReleaseDependencyInventory(inventory);writeFileSync(join(releaseRoot,"SBOM.json"),JSON.stringify(inventory.sbom,null,2)+"\n");writeFileSync(join(releaseRoot,"THIRD_PARTY_LICENSES.json"),JSON.stringify(inventory.licenses,null,2)+"\n");writeFileSync(join(releaseRoot,"THIRD_PARTY_NOTICES.txt"),inventory.notices);paths.push("SBOM.json","THIRD_PARTY_LICENSES.json","THIRD_PARTY_NOTICES.txt")
  const manifest=createReleaseManifest({root:releaseRoot,target,productVersion:MATHOS_PRODUCT_VERSION,gitRevision:identity.gitRevision,buildId:identity.buildId,paths});writeFileSync(join(releaseRoot,"RELEASE-MANIFEST.json"),JSON.stringify(manifest,null,2)+"\n");writeFileSync(join(releaseRoot,"SHA256SUMS"),manifest.files.map(file=>`${file.sha256}  ${file.path}`).join("\n")+"\n")
  const archiveName=`mathos-${MATHOS_PRODUCT_VERSION}-${target}.tar.gz`,archivePath=join(outputRoot,MATHOS_PRODUCT_VERSION,archiveName),tar=Bun.spawnSync(["tar","-czf",archivePath,"-C",dirname(releaseRoot),"root"],{stdout:"pipe",stderr:"pipe"});if(tar.exitCode!==0)throw new Error(`RELEASE_ARCHIVE_FAILED:${new TextDecoder().decode(tar.stderr)}`)
  const archiveChecksumPath=writeReleaseArchiveChecksums(outputRoot,MATHOS_PRODUCT_VERSION)
  return{releaseRoot,executable,manifest,archiveName,archivePath,archiveChecksumPath}
}
if(import.meta.main){const target=process.argv.find(arg=>arg.startsWith("--target="))?.slice(9)??hostReleaseTarget();const result=await buildRelease(target);console.log(JSON.stringify({releaseRoot:result.releaseRoot,archiveName:result.archiveName,files:result.manifest.files.length},null,2))}
